import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import ExcelExportButton from '@/components/ExcelExportButton';

// 타입 정의
type StudentWithStats = {
  id: string;
  email: string;
  full_name: string | null;
  class_name: string | null;
  student_number: string | null;
  grade_level: string | null;
  total_tests: number;
  last_test_date: string | null;
  completion_rate: number;
  avg_accuracy: number;
  avg_time: number | null; // 평균 평가 시간 (초)
};

type TestResult = {
  user_id: string;
  test_type: string;
  is_correct: boolean | null;
  accuracy: number | null;
  created_at: string;
  time_taken: number | null;
};

export default async function TeacherDashboard() {
  console.log('[TeacherDashboard] Page started');
  
  const supabase = await createClient();
  console.log('[TeacherDashboard] Supabase client created');

  // 세션 확인 - getUser()로 변경 (더 안정적)
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log('[TeacherDashboard] Auth check:', {
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email,
    error: userError?.message
  });
  
  if (userError || !user) {
    console.error('[TeacherDashboard] ❌ Authentication FAILED:', userError);
    redirect('/');
  }
  
  console.log('[TeacherDashboard] ✅ Authentication SUCCESS:', user.email);

  // 교사 프로필 확인
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // 프로필이 없거나 교사/관리자가 아닌 경우
  const isTeacherOrAdmin = profile && (profile.role === 'teacher' || profile.role === 'admin');
  if (profileError || !profile || !isTeacherOrAdmin) {
    return (
      <div style={{ 
        backgroundColor: '#f3f4f6', 
        backgroundSize: 'cover', 
        minHeight: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        color: '#171717'
      }}>
        <div style={{
          textAlign: 'center', 
          backgroundColor: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.1)', 
          padding: '2rem', 
          borderRadius: '15px',
          maxWidth: '600px'
        }}>
          <h1 style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '1rem', fontWeight: 'bold' }}>⚠️ 접근 권한 없음</h1>
          <p style={{ marginBottom: '1rem' }}>교사 계정으로만 접근 가능합니다.</p>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
            교사 프로필 설정이 필요합니다. 관리자에게 문의하세요.
          </p>
          <Link 
            href="/lobby" 
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white',
              padding: '0.8rem 1.5rem',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: '600',
              boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.3s ease'
            }}
          >
            로비로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // 담당 학생 목록 가져오기
  // admin인 경우 모든 학생 배정을 가져오고, teacher인 경우 자기 학생만
  let assignments: Array<{ student_id: string; class_name: string | null }> | null = null;
  let assignmentsError: Error | null = null;

  if (profile.role === 'admin') {
    const result = await supabase
      .from('teacher_student_assignments')
      .select('student_id, class_name');
    assignments = result.data;
    assignmentsError = result.error as Error | null;
  } else {
    const result = await supabase
      .from('teacher_student_assignments')
      .select('student_id, class_name')
      .eq('teacher_id', user.id);
    assignments = result.data;
    assignmentsError = result.error as Error | null;
  }

  if (assignmentsError) {
    console.error('학생 목록 조회 에러:', assignmentsError);
  }

  const studentIds = assignments?.map(a => a.student_id) || [];

  // 학생들의 테스트 결과 통계 가져오기
  let studentsWithStats: StudentWithStats[] = [];
  
  if (studentIds.length > 0) {
    // 학생 프로필 가져오기
    const { data: studentProfiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', studentIds);

    // 학생 이메일 가져오기 (auth.users) - 에러 처리 추가
    let users: Array<{ id: string; email?: string }> = [];
    try {
      const { data } = await supabase.auth.admin.listUsers();
      users = data.users || [];
    } catch (error) {
      console.error('사용자 목록 조회 에러:', error);
      // 이메일을 가져오지 못해도 계속 진행
    }
    
    // 테스트 결과 가져오기 (time_taken 포함)
    // RLS 정책이 제대로 작동하도록 각 학생별로 개별 쿼리 실행
    // .in() 쿼리는 RLS 정책이 일부 학생에 대해 제대로 작동하지 않을 수 있음
    let allTestResults: TestResult[] = [];
    
    // 배치로 처리 (성능 최적화: 한 번에 10명씩)
    const batchSize = 10;
    for (let i = 0; i < studentIds.length; i += batchSize) {
      const batch = studentIds.slice(i, i + batchSize);
      
      // 배치 내에서 각 학생별로 쿼리 실행
      const batchPromises = batch.map(async (studentId) => {
        const { data: studentResults, error: resultError } = await supabase
          .from('test_results')
          .select('user_id, test_type, is_correct, accuracy, created_at, time_taken')
          .eq('user_id', studentId);
        
        if (resultError) {
          console.error(`[TeacherDashboard] 학생 ${studentId}의 결과 조회 오류:`, resultError);
          return [];
        }
        return studentResults || [];
      });
      
      const batchResults = await Promise.all(batchPromises);
      allTestResults = [...allTestResults, ...batchResults.flat()];
    }
    
    const testResults = allTestResults;

    // 학생별 통계 계산
    studentsWithStats = studentIds.map(studentId => {
      const studentProfile = studentProfiles?.find(p => p.id === studentId);
      const studentUser = users?.find(u => u.id === studentId);
      const studentTests = (testResults as TestResult[])?.filter(r => r.user_id === studentId) || [];
      
      // 테스트 타입별 개수
      const testTypes = [...new Set(studentTests.map(t => t.test_type))];
      const completionRate = Math.round((testTypes.length / 6) * 100); // 6개 교시 기준
      
      // 평균 정확도 계산
      const accuracyTests = studentTests.filter(t => t.accuracy !== null);
      const avgAccuracy = accuracyTests.length > 0
        ? Math.round(accuracyTests.reduce((sum, t) => sum + (t.accuracy || 0), 0) / accuracyTests.length)
        : 0;
      
      // 마지막 테스트 날짜
      const lastTestDate = studentTests.length > 0
        ? new Date(Math.max(...studentTests.map(t => new Date(t.created_at).getTime()))).toLocaleDateString('ko-KR')
        : null;

      // 평균 평가 시간 계산 (초 단위)
      const timeTests = studentTests.filter(t => t.time_taken !== null && t.time_taken > 0);
      const avgTime = timeTests.length > 0
        ? Math.round(timeTests.reduce((sum, t) => sum + (t.time_taken || 0), 0) / timeTests.length)
        : null;

      return {
        id: studentId,
        email: studentUser?.email || '이메일 없음',
        full_name: studentProfile?.full_name || null,
        class_name: studentProfile?.class_name || null,
        student_number: studentProfile?.student_number || null,
        grade_level: studentProfile?.grade_level || null,
        total_tests: studentTests.length,
        last_test_date: lastTestDate,
        completion_rate: completionRate,
        avg_accuracy: avgAccuracy,
        avg_time: avgTime,
      };
    });

    // 반별로 정렬
    studentsWithStats.sort((a, b) => {
      if (a.class_name && b.class_name) return a.class_name.localeCompare(b.class_name);
      if (a.class_name) return -1;
      if (b.class_name) return 1;
      return 0;
    });
  }

  // 반별 그룹화
  const studentsByClass: { [key: string]: StudentWithStats[] } = {};
  studentsWithStats.forEach(student => {
    const className = student.class_name || '미지정';
    if (!studentsByClass[className]) {
      studentsByClass[className] = [];
    }
    studentsByClass[className].push(student);
  });

  return (
    <div style={{ 
      backgroundColor: '#f3f4f6', 
      backgroundSize: 'cover', 
      minHeight: '100vh',
      padding: '2rem',
      color: '#171717'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '2rem',
          borderRadius: '15px',
          marginBottom: '2rem',
          border: '1px solid rgba(255, 215, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div>
                <h1 style={{ 
                  fontSize: '2.5rem', 
                  margin: 0,
                  fontFamily: 'var(--font-nanum-pen)',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontWeight: 'bold'
                }}>
                  🎓 교사 관리 대시보드
                </h1>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
                  {profile.full_name?.replace(' 선생님', '') || user.email} 선생님
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <ExcelExportButton />
              <Link
                href="/teacher/curriculum-data"
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366f1',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: '600',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  transition: 'all 0.2s',
                  display: 'inline-block'
                }}
                className="curriculum-data-link"
              >
                📚 교육과정 데이터
              </Link>
              <Link 
                href="/lobby"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontWeight: '600',
                  fontSize: '0.95rem',
                  boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.3)',
                  transition: 'all 0.3s ease'
                }}
              >
                🏠 로비로
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* 빠른 링크 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <Link
            href="/teacher/test-items"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              padding: '1.25rem',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
            }}
            className="quick-link"
          >
            📋 평가 문항 및 정답 확인
          </Link>
          <Link
            href="/teacher/generate-items"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              padding: '1.25rem',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
            }}
            className="quick-link"
          >
            🤖 AI 문항 생성기
          </Link>
          <Link
            href="/teacher/curriculum-data"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '1.25rem',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
            }}
            className="quick-link"
          >
            📚 교육과정 데이터
          </Link>
          <Link
            href="/teacher/transcription-accuracy"
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white',
              padding: '1.25rem',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: '600',
              textAlign: 'center',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.3)'
            }}
            className="quick-link"
          >
            🎤 음성 인식 정확도 점검
          </Link>
        </div>


        {/* 통계 요약 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '2px solid rgba(76, 175, 80, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4CAF50' }}>
              {studentsWithStats.length}
            </div>
            <div style={{ marginTop: '0.5rem', opacity: 0.9 }}>총 학생 수</div>
          </div>
          <div style={{
            backgroundColor: 'rgba(33, 150, 243, 0.2)',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '2px solid rgba(33, 150, 243, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#2196F3' }}>
              {Object.keys(studentsByClass).length}
            </div>
            <div style={{ marginTop: '0.5rem', opacity: 0.9 }}>담당 반 수</div>
          </div>
          <div style={{
            backgroundColor: 'rgba(255, 152, 0, 0.2)',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '2px solid rgba(255, 152, 0, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#FF9800' }}>
              {studentsWithStats.reduce((sum, s) => sum + s.total_tests, 0)}
            </div>
            <div style={{ marginTop: '0.5rem', opacity: 0.9 }}>전체 테스트 수</div>
          </div>
          <div style={{
            backgroundColor: 'rgba(156, 39, 176, 0.2)',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '2px solid rgba(156, 39, 176, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#9C27B0' }}>
              {studentsWithStats.length > 0 
                ? Math.round(studentsWithStats.reduce((sum, s) => sum + s.avg_accuracy, 0) / studentsWithStats.length)
                : 0}%
            </div>
            <div style={{ marginTop: '0.5rem', opacity: 0.9 }}>평균 정확도</div>
          </div>
        </div>

        {/* 학생 목록 (반별) */}
        {studentsWithStats.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.1)',
            padding: '3rem',
            borderRadius: '15px',
            textAlign: 'center'
          }}>
            <h2 style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 'bold' }}>📚 아직 배정된 학생이 없습니다</h2>
            <p style={{ opacity: 0.8, marginTop: '1rem' }}>
              관리자에게 학생 배정을 요청하세요.
            </p>
          </div>
        ) : (
          Object.entries(studentsByClass).map(([className, students]) => (
            <div 
              key={className}
              style={{
                backgroundColor: '#ffffff',
                padding: '2rem',
                borderRadius: '15px',
                marginBottom: '2rem',
                border: '1px solid rgba(255, 215, 0, 0.3)'
              }}
            >
              <h2 style={{ 
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontWeight: 'bold', 
                marginBottom: '1.5rem',
                fontSize: '1.8rem',
                borderBottom: '2px solid rgba(255, 215, 0, 0.3)',
                paddingBottom: '0.5rem'
              }}>
                📘 {className} ({students.length}명)
              </h2>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                {students.map(student => (
                  <Link
                    key={student.id}
                    href={`/teacher/student-detail?id=${student.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div 
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        padding: '1.5rem',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                      className="student-card"
                    >
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                        gap: '1rem',
                        alignItems: 'center'
                      }}>
                        {/* 학생 정보 */}
                        <div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                            {student.full_name || student.email}
                          </div>
                          <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                            {student.student_number && `번호: ${student.student_number}`}
                            {student.grade_level && ` | ${student.grade_level}`}
                          </div>
                        </div>

                        {/* 테스트 수 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2196F3' }}>
                            {student.total_tests}
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>테스트 수</div>
                        </div>

                        {/* 완료율 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            fontSize: '1.5rem', 
                            fontWeight: 'bold',
                            color: student.completion_rate >= 80 ? '#4CAF50' : 
                                   student.completion_rate >= 60 ? '#FF9800' : '#F44336'
                          }}>
                            {student.completion_rate}%
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>완료율</div>
                        </div>

                        {/* 평균 정확도 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            fontSize: '1.5rem', 
                            fontWeight: 'bold',
                            color: student.avg_accuracy >= 80 ? '#4CAF50' : 
                                   student.avg_accuracy >= 60 ? '#FF9800' : '#F44336'
                          }}>
                            {student.avg_accuracy}%
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>평균 정확도</div>
                        </div>

                        {/* 평균 평가 시간 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ 
                            fontSize: '1.5rem', 
                            fontWeight: 'bold',
                            color: '#9C27B0'
                          }}>
                            {student.avg_time !== null 
                              ? `${Math.floor(student.avg_time / 60)}분 ${student.avg_time % 60}초`
                              : '-'
                            }
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>평균 시간</div>
                        </div>

                        {/* 마지막 테스트 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                            {student.last_test_date || '-'}
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>마지막 테스트</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


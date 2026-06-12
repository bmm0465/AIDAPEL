import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// 캐싱 방지
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 타입 정의
type TeacherWithStudents = {
  id: string;
  email: string;
  full_name: string | null;
  students: StudentWithStats[];
  totalStudents: number;
  totalTests: number;
  avgAccuracy: number;
};

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
  avg_time: number | null;
};

type TestResult = {
  user_id: string;
  test_type: string;
  is_correct: boolean | null;
  accuracy: number | null;
  created_at: string;
  time_taken: number | null;
};

export async function GET() {
  try {
    const supabase = await createClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
    }

    const service = createServiceClient();

    // admin 역할 확인
    const { data: profile } = await service
      .from('user_profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
    }

    // 모든 교사 목록 가져오기
    const { data: teachers, error: teachersError } = await service
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('role', 'teacher');

    if (teachersError) {
      console.error('[Admin API] 교사 목록 조회 오류:', teachersError);
      return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 });
    }

    // 교사 이메일 가져오기
    let authUsers: Array<{ id: string; email?: string }> = [];
    try {
      const { data } = await service.auth.admin.listUsers();
      authUsers = data.users || [];
    } catch (error) {
      console.error('[Admin API] 사용자 이메일 조회 오류:', error);
    }

    // 모든 teacher_student_assignments 가져오기
    const { data: allAssignments } = await service
      .from('teacher_student_assignments')
      .select('teacher_id, student_id, class_name');

    // 모든 학생 프로필 가져오기
    const allStudentIds = [...new Set(allAssignments?.map(a => a.student_id) || [])];
    
    let allStudentProfiles: Array<{
      id: string;
      full_name: string | null;
      class_name: string | null;
      student_number: string | null;
      grade_level: string | null;
    }> = [];
    
    if (allStudentIds.length > 0) {
      const { data: profiles } = await service
        .from('user_profiles')
        .select('id, full_name, class_name, student_number, grade_level')
        .in('id', allStudentIds);
      allStudentProfiles = profiles || [];
    }

    // 모든 테스트 결과 가져오기
    let allTestResults: TestResult[] = [];
    if (allStudentIds.length > 0) {
      // 배치로 처리 (Supabase 기본 limit 1000개 제한 우회)
      const batchSize = 10;
      for (let i = 0; i < allStudentIds.length; i += batchSize) {
        const batch = allStudentIds.slice(i, i + batchSize);
        const { data: batchResults } = await service
          .from('test_results')
          .select('user_id, test_type, is_correct, accuracy, created_at, time_taken')
          .in('user_id', batch)
          .limit(10000);
        if (batchResults) {
          allTestResults = [...allTestResults, ...batchResults];
        }
      }
    }

    // 교사별 데이터 구성
    const teachersWithStudents: TeacherWithStudents[] = (teachers || []).map(teacher => {
      const teacherUser = authUsers.find(u => u.id === teacher.id);
      const teacherAssignments = allAssignments?.filter(a => a.teacher_id === teacher.id) || [];
      const teacherStudentIds = teacherAssignments.map(a => a.student_id);

      // 학생별 통계 계산
      const students: StudentWithStats[] = teacherStudentIds.map(studentId => {
        const studentProfile = allStudentProfiles.find(p => p.id === studentId);
        const studentUser = authUsers.find(u => u.id === studentId);
        const studentTests = allTestResults.filter(r => r.user_id === studentId);

        // 테스트 타입별 개수
        const testTypes = [...new Set(studentTests.map(t => t.test_type))];
        const completionRate = Math.round((testTypes.length / 6) * 100);

        // 평균 정확도 (is_correct 기준)
        const validTests = studentTests.filter(t => t.is_correct !== null);
        const correctTests = validTests.filter(t => t.is_correct === true);
        const avgAccuracy = validTests.length > 0
          ? Math.round((correctTests.length / validTests.length) * 100)
          : 0;

        // 마지막 테스트 날짜
        const lastTestDate = studentTests.length > 0
          ? new Date(Math.max(...studentTests.map(t => new Date(t.created_at).getTime()))).toLocaleDateString('ko-KR')
          : null;

        // 평균 평가 시간
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
      students.sort((a, b) => {
        if (a.class_name && b.class_name) return a.class_name.localeCompare(b.class_name);
        if (a.class_name) return -1;
        if (b.class_name) return 1;
        return 0;
      });

      // 교사별 집계 통계
      const totalTests = students.reduce((sum, s) => sum + s.total_tests, 0);
      const avgAccuracy = students.length > 0
        ? Math.round(students.reduce((sum, s) => sum + s.avg_accuracy, 0) / students.length)
        : 0;

      return {
        id: teacher.id,
        email: teacherUser?.email || '이메일 없음',
        full_name: teacher.full_name,
        students,
        totalStudents: students.length,
        totalTests,
        avgAccuracy,
      };
    });

    // 교사명 정렬
    teachersWithStudents.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    return NextResponse.json({
      admin: {
        id: user.id,
        email: user.email,
        full_name: profile.full_name,
      },
      teachers: teachersWithStudents,
      summary: {
        totalTeachers: teachersWithStudents.length,
        totalStudents: allStudentIds.length,
        totalTests: allTestResults.length,
        avgAccuracy: teachersWithStudents.length > 0
          ? Math.round(teachersWithStudents.reduce((sum, t) => sum + t.avgAccuracy, 0) / teachersWithStudents.length)
          : 0,
      },
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error('[Admin API] 오류:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

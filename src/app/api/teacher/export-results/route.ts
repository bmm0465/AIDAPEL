import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

// 캐싱 방지
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// test_type 매핑
const TEST_TYPE_MAP: Record<string, string> = {
  'p1_alphabet': '1교시',
  'p2_segmental_phoneme': '2교시',
  'p3_suprasegmental_phoneme': '3교시',
  'p4_fluency': '4교시',
  'p5_vocabulary': '5교시',
  'p6_comprehension': '6교시',
};

// 이메일에서 학교 정보 추출
function extractSchoolFromEmail(email: string | null | undefined): string {
  if (!email) return '미지정';
  
  // 이메일 형식: school@domain.com
  // 도메인 부분을 학교명으로 사용 (예: danjae.school.co.kr -> danjae)
  const parts = email.split('@');
  if (parts.length < 2) return '미지정';
  
  const domain = parts[1];
  // 도메인에서 첫 번째 부분 추출 (예: danjae.school.co.kr -> danjae)
  const domainParts = domain.split('.');
  const schoolName = domainParts[0];
  
  // 한글 학교명이 포함된 경우를 대비하여 이메일 앞부분도 확인
  // 예: danjae@school.com -> danjae
  const emailPrefix = parts[0];
  
  // 도메인 첫 부분이 일반적인 도메인(gmail, naver 등)이면 이메일 앞부분 사용
  const commonDomains = ['gmail', 'naver', 'daum', 'yahoo', 'hotmail', 'outlook'];
  if (commonDomains.includes(schoolName.toLowerCase())) {
    return emailPrefix || '미지정';
  }
  
  return schoolName || emailPrefix || '미지정';
}

// 초를 분:초 형식으로 변환
function formatTime(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0분 0초';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}분 ${secs}초`;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 교사 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const service = createServiceClient();
    
    // 교사 프로필 확인
    const { data: profile } = await service
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // 쿼리 파라미터에서 test_type 가져오기
    const { searchParams } = new URL(request.url);
    const testType = searchParams.get('test_type') || null; // null이면 모든 교시
    
    // 담당 학생 목록 가져오기 (admin은 모든 학생)
    let assignments: Array<{ student_id: string }> | null = null;
    let assignmentsError: Error | null = null;

    if (profile.role === 'admin') {
      const result = await service
        .from('teacher_student_assignments')
        .select('student_id');
      assignments = result.data;
      assignmentsError = result.error as Error | null;
    } else {
      const result = await service
        .from('teacher_student_assignments')
        .select('student_id')
        .eq('teacher_id', user.id);
      assignments = result.data;
      assignmentsError = result.error as Error | null;
    }
    
    if (assignmentsError) {
      console.error('[Export] 학생 목록 조회 오류:', assignmentsError);
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }
    
    const studentIds = assignments?.map(a => a.student_id) || [];
    
    if (studentIds.length === 0) {
      return NextResponse.json({ error: 'No students assigned' }, { status: 404 });
    }
    
    // 학생 프로필 가져오기
    const { data: studentProfiles, error: profilesError } = await service
      .from('user_profiles')
      .select('id, full_name, class_name, student_number, grade_level')
      .in('id', studentIds)
      .eq('role', 'student');
    
    if (profilesError) {
      console.error('[Export] 학생 프로필 조회 오류:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch student profiles' }, { status: 500 });
    }
    
    // 학생 이메일 가져오기 (auth.users)
    const userEmails: Map<string, string> = new Map();
    try {
      const { data: { users } } = await service.auth.admin.listUsers();
      users?.forEach(u => {
        if (u.email) {
          userEmails.set(u.id, u.email);
        }
      });
    } catch (error) {
      console.error('[Export] 사용자 이메일 조회 오류:', error);
    }
    
    // 테스트 결과 가져오기
    let testResultsQuery = service
      .from('test_results')
      .select('user_id, test_type, is_correct, time_taken, created_at')
      .in('user_id', studentIds);
    
    if (testType) {
      testResultsQuery = testResultsQuery.eq('test_type', testType);
    }
    
    const { data: testResults, error: resultsError } = await testResultsQuery;
    
    if (resultsError) {
      console.error('[Export] 테스트 결과 조회 오류:', resultsError);
      return NextResponse.json({ error: 'Failed to fetch test results' }, { status: 500 });
    }
    
    // 데이터 집계
    const studentDataMap = new Map<string, {
      school: string;
      grade: string;
      class: string;
      number: string;
      name: string;
      totalQuestions: number;
      correctQuestions: number;
      totalTime: number;
    }>();
    
    // 학생별 초기화
    studentProfiles?.forEach(profile => {
      const email = userEmails.get(profile.id) || '';
      studentDataMap.set(profile.id, {
        school: extractSchoolFromEmail(email),
        grade: profile.grade_level || '미지정',
        class: profile.class_name || '미지정',
        number: profile.student_number || '미지정',
        name: profile.full_name || '미지정',
        totalQuestions: 0,
        correctQuestions: 0,
        totalTime: 0,
      });
    });
    
    // 테스트 결과 집계
    // created_at을 기반으로 세션 그룹화 (같은 날짜/시간대의 결과를 하나의 세션으로 간주)
    const sessionTimeMap = new Map<string, number>(); // sessionKey -> max time_taken
    
    testResults?.forEach(result => {
      const studentData = studentDataMap.get(result.user_id);
      if (!studentData) return;
      
      studentData.totalQuestions += 1;
      if (result.is_correct) {
        studentData.correctQuestions += 1;
      }
      
      // created_at을 기반으로 세션 키 생성 (날짜 + 시간대별로 그룹화)
      if (result.time_taken && result.created_at) {
        const createdAt = new Date(result.created_at);
        // 같은 날짜의 같은 시간대(1시간 단위)를 하나의 세션으로 간주
        const sessionKey = `${result.user_id}|${createdAt.toISOString().split('T')[0]}|${Math.floor(createdAt.getHours())}`;
        const currentMax = sessionTimeMap.get(sessionKey) || 0;
        // 각 세션의 최대 time_taken을 사용 (세션 전체 시간으로 간주)
        if (result.time_taken > currentMax) {
          sessionTimeMap.set(sessionKey, result.time_taken);
        }
      }
    });
    
    // 세션별 시간을 학생별 총 시간에 합산
    sessionTimeMap.forEach((maxTime, sessionKey) => {
      const [userId] = sessionKey.split('|');
      const studentData = studentDataMap.get(userId);
      if (studentData) {
        studentData.totalTime += maxTime;
      }
    });
    
    // 엑셀 데이터 준비
    const excelData = Array.from(studentDataMap.values())
      .map(data => ({
        '학교': data.school,
        '학년': data.grade,
        '반': data.class,
        '번호': data.number,
        '이름': data.name,
        '풀이한(발화한) 문제의 개수': data.totalQuestions,
        '맞힌 문제의 개수': data.correctQuestions,
        '정답률(맞힌 문제의 개수/풀이한(발화한) 문제의 개수)': 
          data.totalQuestions > 0 
            ? `${Math.round((data.correctQuestions / data.totalQuestions) * 100)}%`
            : '0%',
        '평가 시간': formatTime(data.totalTime),
      }))
      .sort((a, b) => {
        // 학년, 반, 번호 순으로 정렬
        if (a['학년'] !== b['학년']) {
          return String(a['학년']).localeCompare(String(b['학년']));
        }
        if (a['반'] !== b['반']) {
          return String(a['반']).localeCompare(String(b['반']));
        }
        return String(a['번호']).localeCompare(String(b['번호']));
      });
    
    // 엑셀 워크북 생성
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '학생 평가 결과');
    
    // 파일명 생성
    const testTypeLabel = testType ? TEST_TYPE_MAP[testType] || testType : '전체';
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `학생평가결과_${testTypeLabel}_${dateStr}.xlsx`;
    
    // 엑셀 파일 버퍼 생성
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // 응답 반환
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[Export] 엑셀 내보내기 오류:', error);
    return NextResponse.json(
      { error: 'Failed to export data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

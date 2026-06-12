import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 캐싱 방지
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await params
    console.log('API: Fetching results for student:', studentId)
    
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('API: Auth check - user:', user?.id, 'error:', authError)
    
    if (authError || !user) {
      console.log('API: Unauthorized access')
      return NextResponse.json({ error: 'Unauthorized' }, { 
        status: 401,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      })
    }

    const service = createServiceClient()

    // Ensure requester is a teacher
    const { data: profile } = await service
      .from('user_profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    console.log('API: Profile check - profile:', profile)
    
    if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
      console.log('API: Not a teacher or admin')
      return NextResponse.json({ error: 'Forbidden' }, { 
        status: 403,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      })
    }

    // Verify teacher-student assignment (admin은 건너뜀)
    let assignment: { class_name: string | null } | null = null;
    
    if (profile.role === 'admin') {
      // admin은 모든 학생에 접근 가능 - 학생의 class_name을 user_profiles에서 가져옴
      const { data: studentProfile } = await service
        .from('user_profiles')
        .select('class_name')
        .eq('id', studentId)
        .single();
      assignment = { class_name: studentProfile?.class_name || '미지정' };
    } else {
      const { data: assignmentData } = await service
        .from('teacher_student_assignments')
        .select('class_name')
        .eq('teacher_id', user.id)
        .eq('student_id', studentId)
        .single();
      assignment = assignmentData;
    }

    console.log('API: Assignment check - assignment:', assignment)
    
    if (!assignment) {
      console.log('API: Student not assigned to teacher')
      return NextResponse.json({ error: 'Not assigned' }, { 
        status: 403,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      })
    }

    // Student profile
    const { data: student } = await service
      .from('user_profiles')
      .select('id, full_name, class_name, grade_level, student_number')
      .eq('id', studentId)
      .single()

    console.log('API: Student profile - student:', student)
    
    if (!student) {
      console.log('API: Student not found')
      return NextResponse.json({ error: 'Student not found' }, { 
        status: 404,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      })
    }

    // Results - audio_url과 transcription_results, time_taken도 포함
    const { data: results } = await service
      .from('test_results')
      .select('id, test_type, question, student_answer, is_correct, created_at, audio_url, transcription_results, correct_answer, time_taken')
      .eq('user_id', studentId)
      .order('created_at', { ascending: false })

    console.log('API: Test results - count:', results?.length || 0)

    // Build simple stats
    const stats: Record<string, { total: number, correct: number, accuracy: number }> = {}
    for (const r of results || []) {
      const key = r.test_type || 'UNKNOWN'
      if (!stats[key]) stats[key] = { total: 0, correct: 0, accuracy: 0 }
      stats[key].total += 1
      if (r.is_correct) stats[key].correct += 1
    }
    for (const key of Object.keys(stats)) {
      const s = stats[key]
      s.accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0
    }

    console.log('API: Returning data successfully')
    return NextResponse.json({
      student,
      assignment,
      results: results || [],
      stats,
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (e) {
    console.error('Teacher fetch results error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  }
}

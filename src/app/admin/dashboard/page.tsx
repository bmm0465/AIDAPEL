'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SkeletonPage } from '@/components/LoadingSkeleton'
import Link from 'next/link'

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
  avg_time: number | null;
};

type TeacherWithStudents = {
  id: string;
  email: string;
  full_name: string | null;
  students: StudentWithStats[];
  totalStudents: number;
  totalTests: number;
  avgAccuracy: number;
};

type AdminDashboardData = {
  admin: {
    id: string;
    email: string;
    full_name: string | null;
  };
  teachers: TeacherWithStudents[];
  summary: {
    totalTeachers: number;
    totalStudents: number;
    totalTests: number;
    avgAccuracy: number;
  };
};

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/');
        return;
      }

      try {
        const response = await fetch('/api/admin/teachers', {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status === 401) {
          router.push('/');
          return;
        }

        if (response.status === 403) {
          setError('관리자 권한이 필요합니다.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          setError('데이터를 불러오는 중 오류가 발생했습니다.');
          setLoading(false);
          return;
        }

        const result = await response.json();
        setData(result);
        // 기본적으로 모든 교사 펼치기
        setExpandedTeachers(new Set(result.teachers.map((t: TeacherWithStudents) => t.id)));
        setLoading(false);
      } catch (err) {
        console.error('Admin dashboard error:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleLogout = async () => {
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    setLoggingOut(true);
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      alert('로그아웃 중 오류가 발생했습니다.');
      setLoggingOut(false);
    }
  };

  const toggleTeacher = (teacherId: string) => {
    setExpandedTeachers(prev => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#f3f4f6',
        minHeight: '100vh',
        padding: '2rem',
        color: '#171717',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <SkeletonPage />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        backgroundColor: '#f3f4f6',
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
          <h1 style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '1rem',
            fontWeight: 'bold'
          }}>⚠️ {error || '오류 발생'}</h1>
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
            }}
          >
            로비로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const { admin, teachers, summary } = data;

  return (
    <div style={{
      backgroundColor: '#f3f4f6',
      minHeight: '100vh',
      padding: '2rem',
      color: '#171717',
      fontFamily: 'sans-serif',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '2rem',
          borderRadius: '15px',
          marginBottom: '2rem',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{
                fontSize: '2.5rem',
                margin: 0,
                fontFamily: 'var(--font-nanum-pen)',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontWeight: 'bold'
              }}>
                🏛️ 관리자 대시보드
              </h1>
              <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, color: '#4b5563' }}>
                {admin.full_name || admin.email} · 모든 교사 및 학생 데이터 열람
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  background: loggingOut
                    ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                    : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '10px',
                  cursor: loggingOut ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxShadow: loggingOut ? 'none' : '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
                }}
              >
                {loggingOut ? '로그아웃 중...' : '🚪 로그아웃'}
              </button>
            </div>
          </div>
        </div>

        {/* 전체 통계 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <StatCard value={summary.totalTeachers} label="전체 교사 수" color="#6366f1" bgColor="rgba(99, 102, 241, 0.1)" borderColor="rgba(99, 102, 241, 0.3)" />
          <StatCard value={summary.totalStudents} label="전체 학생 수" color="#10b981" bgColor="rgba(16, 185, 129, 0.1)" borderColor="rgba(16, 185, 129, 0.3)" />
          <StatCard value={summary.totalTests} label="전체 테스트 수" color="#f59e0b" bgColor="rgba(245, 158, 11, 0.1)" borderColor="rgba(245, 158, 11, 0.3)" />
          <StatCard value={`${summary.avgAccuracy}%`} label="전체 평균 정답률" color="#8b5cf6" bgColor="rgba(139, 92, 246, 0.1)" borderColor="rgba(139, 92, 246, 0.3)" />
        </div>

        {/* 교사별 학생 목록 */}
        {teachers.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            padding: '3rem',
            borderRadius: '15px',
            textAlign: 'center'
          }}>
            <h2 style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 'bold'
            }}>📚 등록된 교사가 없습니다</h2>
          </div>
        ) : (
          teachers.map(teacher => (
            <div
              key={teacher.id}
              style={{
                backgroundColor: '#ffffff',
                padding: '0',
                borderRadius: '15px',
                marginBottom: '1.5rem',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.07)',
                overflow: 'hidden',
              }}
            >
              {/* 교사 헤더 (클릭으로 접기/펼치기) */}
              <div
                onClick={() => toggleTeacher(teacher.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.5rem 2rem',
                  cursor: 'pointer',
                  background: expandedTeachers.has(teacher.id)
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)'
                    : '#ffffff',
                  borderBottom: expandedTeachers.has(teacher.id) ? '1px solid rgba(99, 102, 241, 0.15)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{
                    fontSize: '1.5rem',
                    transition: 'transform 0.2s ease',
                    transform: expandedTeachers.has(teacher.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}>▶</span>
                  <div>
                    <h2 style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      fontWeight: 'bold',
                      margin: 0,
                      fontSize: '1.5rem',
                    }}>
                      👩‍🏫 {teacher.full_name || '이름 미설정'}
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                      {teacher.email}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <MiniStat value={teacher.totalStudents} label="학생" color="#10b981" />
                  <MiniStat value={teacher.totalTests} label="테스트" color="#3b82f6" />
                  <MiniStat value={`${teacher.avgAccuracy}%`} label="정답률" color="#8b5cf6" />
                </div>
              </div>

              {/* 학생 목록 (펼침 상태) */}
              {expandedTeachers.has(teacher.id) && (
                <div style={{ padding: '1rem 2rem 1.5rem' }}>
                  {teacher.students.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>
                      배정된 학생이 없습니다.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {/* 테이블 헤더 */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                      }}>
                        <div>학생 정보</div>
                        <div style={{ textAlign: 'center' }}>테스트 수</div>
                        <div style={{ textAlign: 'center' }}>완료율</div>
                        <div style={{ textAlign: 'center' }}>평균 정답률</div>
                        <div style={{ textAlign: 'center' }}>평균 시간</div>
                        <div style={{ textAlign: 'center' }}>마지막 테스트</div>
                      </div>

                      {teacher.students.map(student => (
                        <Link
                          key={student.id}
                          href={`/teacher/student-detail?id=${student.id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr',
                              gap: '0.75rem',
                              padding: '1rem',
                              borderRadius: '10px',
                              border: '1px solid #e5e7eb',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer',
                              alignItems: 'center',
                            }}
                            className="student-row"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                              e.currentTarget.style.borderColor = '#6366f1';
                              e.currentTarget.style.transform = 'translateX(4px)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#ffffff';
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.transform = 'translateX(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {/* 학생 정보 */}
                            <div>
                              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '0.2rem' }}>
                                {student.full_name || student.email}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                {student.class_name && `${student.class_name}`}
                                {student.student_number && ` · ${student.student_number}번`}
                                {student.grade_level && ` · ${student.grade_level}`}
                              </div>
                            </div>

                            {/* 테스트 수 */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>
                                {student.total_tests}
                              </span>
                            </div>

                            {/* 완료율 */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                color: student.completion_rate >= 80 ? '#10b981' :
                                       student.completion_rate >= 60 ? '#f59e0b' : '#ef4444'
                              }}>
                                {student.completion_rate}%
                              </span>
                            </div>

                            {/* 평균 정답률 */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                color: student.avg_accuracy >= 80 ? '#10b981' :
                                       student.avg_accuracy >= 60 ? '#f59e0b' : '#ef4444'
                              }}>
                                {student.avg_accuracy}%
                              </span>
                            </div>

                            {/* 평균 시간 */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#8b5cf6' }}>
                                {student.avg_time !== null
                                  ? `${Math.floor(student.avg_time / 60)}분 ${student.avg_time % 60}초`
                                  : '-'
                                }
                              </span>
                            </div>

                            {/* 마지막 테스트 */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                {student.last_test_date || '-'}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 통계 카드 컴포넌트
function StatCard({ value, label, color, bgColor, borderColor }: {
  value: string | number;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div style={{
      backgroundColor: bgColor,
      padding: '1.5rem',
      borderRadius: '12px',
      border: `2px solid ${borderColor}`,
      textAlign: 'center',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    }}>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color }}>
        {value}
      </div>
      <div style={{ marginTop: '0.5rem', color: '#4b5563', fontWeight: '500' }}>
        {label}
      </div>
    </div>
  );
}

// 미니 통계 컴포넌트 (교사 헤더용)
function MiniStat({ value, label, color }: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
        {label}
      </div>
    </div>
  );
}

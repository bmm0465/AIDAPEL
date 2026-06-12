// scripts/setup-admin.ts
// shim@abs.com 계정에 admin 역할을 부여하는 스크립트

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function setupAdmin() {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('🔍 shim@abs.com 계정 검색...');

  // 1. auth.users에서 shim@abs.com 찾기
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ 사용자 목록 조회 오류:', listError);
    return;
  }

  const adminUser = users?.find(u => u.email === 'shim@abs.com');
  
  if (!adminUser) {
    console.error('❌ shim@abs.com 계정을 찾을 수 없습니다.');
    return;
  }

  console.log('✅ shim@abs.com 계정 발견:', adminUser.id);

  // 2. user_profiles에 admin 프로필 생성/업데이트
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', adminUser.id)
    .single();

  if (existingProfile) {
    console.log('📝 기존 프로필 업데이트...');
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: 'admin', full_name: '관리자' })
      .eq('id', adminUser.id);

    if (updateError) {
      console.error('❌ 프로필 업데이트 오류:', updateError);
      return;
    }
  } else {
    console.log('📝 새 프로필 생성...');
    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        id: adminUser.id,
        full_name: '관리자',
        role: 'admin',
      });

    if (insertError) {
      console.error('❌ 프로필 생성 오류:', insertError);
      return;
    }
  }

  console.log('✅ admin 프로필 설정 완료!');

  // 3. RLS 정책 추가 (SQL 실행)
  console.log('\n📋 RLS 정책 추가...');
  
  const policies = [
    {
      name: 'Admins can view all profiles',
      table: 'user_profiles',
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'user_profiles' 
            AND policyname = 'Admins can view all profiles'
          ) THEN
            CREATE POLICY "Admins can view all profiles"
              ON user_profiles FOR SELECT
              USING (
                EXISTS (
                  SELECT 1 FROM user_profiles up
                  WHERE up.id = auth.uid() AND up.role = 'admin'
                )
              );
          END IF;
        END $$;
      `
    },
    {
      name: 'Admins can view all assignments',
      table: 'teacher_student_assignments',
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'teacher_student_assignments' 
            AND policyname = 'Admins can view all assignments'
          ) THEN
            CREATE POLICY "Admins can view all assignments"
              ON teacher_student_assignments FOR SELECT
              USING (
                EXISTS (
                  SELECT 1 FROM user_profiles up
                  WHERE up.id = auth.uid() AND up.role = 'admin'
                )
              );
          END IF;
        END $$;
      `
    },
    {
      name: 'Admins can view all results',
      table: 'test_results',
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'test_results' 
            AND policyname = 'Admins can view all results'
          ) THEN
            CREATE POLICY "Admins can view all results"
              ON test_results FOR SELECT
              USING (
                EXISTS (
                  SELECT 1 FROM user_profiles up
                  WHERE up.id = auth.uid() AND up.role = 'admin'
                )
              );
          END IF;
        END $$;
      `
    }
  ];

  for (const policy of policies) {
    console.log(`  → ${policy.table}: ${policy.name}`);
    const { error } = await supabase.rpc('exec_sql', { sql: policy.sql });
    if (error) {
      // rpc가 없으면 직접 REST API로는 SQL을 실행할 수 없으므로 안내
      console.log(`  ⚠️  RLS 정책은 Supabase Dashboard에서 수동으로 실행해야 합니다.`);
      break;
    }
  }

  // 4. 현재 교사 목록 확인
  console.log('\n📋 현재 교사 목록:');
  const { data: teachers } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('role', 'teacher');

  if (teachers && teachers.length > 0) {
    for (const teacher of teachers) {
      const teacherUser = users?.find(u => u.id === teacher.id);
      console.log(`  - ${teacher.full_name || '이름 없음'} (${teacherUser?.email || 'email 없음'}) [ID: ${teacher.id}]`);
      
      // 해당 교사에 배정된 학생 수
      const { count } = await supabase
        .from('teacher_student_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', teacher.id);
      
      console.log(`    → 담당 학생: ${count || 0}명`);
    }
  } else {
    console.log('  (교사 계정 없음)');
  }

  console.log('\n✅ 설정 완료! Supabase Dashboard의 SQL Editor에서 RLS 정책을 수동 적용하세요.');
}

setupAdmin().catch(console.error);

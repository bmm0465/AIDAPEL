-- ============================================
-- 관리자(admin) 역할 추가 마이그레이션
-- shim@abs.com 계정이 모든 교사/학생 데이터 열람 가능
-- ============================================

-- 1. admin은 모든 user_profiles 조회 가능
CREATE POLICY IF NOT EXISTS "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- 2. admin은 모든 teacher_student_assignments 조회 가능
CREATE POLICY IF NOT EXISTS "Admins can view all assignments"
  ON teacher_student_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- 3. admin은 모든 test_results 조회 가능
CREATE POLICY IF NOT EXISTS "Admins can view all results"
  ON test_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- 4. shim@abs.com의 user_profiles 생성
-- auth.users에서 shim@abs.com의 id를 찾아서 user_profiles에 삽입
INSERT INTO user_profiles (id, full_name, role, created_at, updated_at)
SELECT 
  au.id,
  '관리자',
  'admin',
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'shim@abs.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = '관리자', updated_at = NOW();

-- 주석 추가
COMMENT ON POLICY "Admins can view all profiles" ON user_profiles IS 
  'admin 역할을 가진 사용자는 모든 사용자 프로필을 조회할 수 있습니다.';
COMMENT ON POLICY "Admins can view all assignments" ON teacher_student_assignments IS 
  'admin 역할을 가진 사용자는 모든 교사-학생 배정을 조회할 수 있습니다.';
COMMENT ON POLICY "Admins can view all results" ON test_results IS 
  'admin 역할을 가진 사용자는 모든 테스트 결과를 조회할 수 있습니다.';

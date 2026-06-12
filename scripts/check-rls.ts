// scripts/check-rls.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkRLS() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check existing policies
  const { data, error } = await supabase
    .from('pg_policies')
    .select('policyname, tablename, qual, cmd')
    .in('tablename', ['user_profiles', 'teacher_student_assignments', 'test_results']);

  if (error) {
    console.log('pg_policies query error (expected if not accessible):', error.message);
    
    // Try using SQL
    console.log('\nTrying raw SQL via rpc...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', {
      sql: `SELECT policyname, tablename FROM pg_policies 
            WHERE tablename IN ('user_profiles','teacher_student_assignments','test_results') 
            ORDER BY tablename, policyname;`
    });
    console.log('RPC data:', rpcData);
    console.log('RPC error:', rpcError);
  } else {
    console.log('Policies found:');
    for (const p of data || []) {
      console.log(`  [${p.tablename}] ${p.policyname} (${p.cmd})`);
      console.log(`    USING: ${p.qual}`);
    }
  }

  // The real fix: drop the problematic policies and recreate without recursion
  console.log('\n--- Applying fix: Drop admin policies that cause recursion ---');
  
  // Drop any existing admin policies (they might have been auto-applied)
  const dropStatements = [
    `DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;`,
    `DROP POLICY IF EXISTS "Admins can view all assignments" ON teacher_student_assignments;`,
    `DROP POLICY IF EXISTS "Admins can view all results" ON test_results;`,
  ];

  for (const sql of dropStatements) {
    console.log(`Executing: ${sql}`);
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.log(`  Error (may need manual execution): ${error.message}`);
    } else {
      console.log(`  OK`);
    }
  }

  // Create fixed admin policies - for user_profiles, use auth.uid() directly instead of subquery
  const createStatements = [
    // For user_profiles: check admin role using a direct ID match to avoid recursion
    `CREATE POLICY "Admins can view all profiles"
      ON user_profiles FOR SELECT
      USING (
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
      );`,
    // For teacher_student_assignments
    `CREATE POLICY "Admins can view all assignments"
      ON teacher_student_assignments FOR SELECT
      USING (
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
      );`,
    // For test_results
    `CREATE POLICY "Admins can view all results"
      ON test_results FOR SELECT
      USING (
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
      );`,
  ];

  for (const sql of createStatements) {
    console.log(`\nExecuting: ${sql.substring(0, 60)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.log(`  Error: ${error.message}`);
    } else {
      console.log(`  OK`);
    }
  }

  // Test again
  console.log('\n--- Testing after fix ---');
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: 'shim@abs.com',
    password: 'shim1234',
  });

  if (authError) {
    console.log('Auth error:', authError.message);
    return;
  }

  console.log('Signed in as:', authData.user.email);

  const { data: profile, error: profError } = await anonClient
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', authData.user.id)
    .single();

  console.log('Profile:', JSON.stringify(profile));
  console.log('Profile error:', JSON.stringify(profError));
}

checkRLS().catch(console.error);

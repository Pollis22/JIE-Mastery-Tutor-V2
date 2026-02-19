import { pool } from '../server/db';
import { getRecentSessionSummaries, buildContinuityBlock } from '../server/services/memory-service';

async function testStudentIsolation() {
  console.log('=== Student Isolation Regression Test ===\n');

  const suffix = Date.now().toString();
  const SUMMARY_A_ID = `test-iso-sum-a-${suffix}`;
  const SUMMARY_B_ID = `test-iso-sum-b-${suffix}`;

  let passed = 0;
  let failed = 0;
  let testUserId: string | null = null;
  let studentAId: string | null = null;
  let studentBId: string | null = null;

  try {
    const userResult = await pool.query(`SELECT id FROM users LIMIT 1`);
    if (userResult.rows.length === 0) {
      console.log('No users in database. Cannot run test.');
      process.exit(1);
    }
    testUserId = userResult.rows[0].id;

    const studentResult = await pool.query(`SELECT id, name FROM students WHERE owner_user_id = $1 LIMIT 2`, [testUserId]);
    if (studentResult.rows.length < 2) {
      console.log('Need at least 2 student profiles. Cannot run test.');
      process.exit(1);
    }
    studentAId = studentResult.rows[0].id;
    studentBId = studentResult.rows[1].id;
    console.log(`User: ${testUserId}`);
    console.log(`Student A: ${studentAId} (${studentResult.rows[0].name})`);
    console.log(`Student B: ${studentBId} (${studentResult.rows[1].name})\n`);

    const sessResult = await pool.query(
      `SELECT id, student_id FROM realtime_sessions WHERE user_id = $1 AND student_id IN ($2, $3) ORDER BY created_at DESC LIMIT 2`,
      [testUserId, studentAId, studentBId]
    );

    let sessionAId: string | null = null;
    let sessionBId: string | null = null;

    for (const row of sessResult.rows) {
      if (row.student_id === studentAId && !sessionAId) sessionAId = row.id;
      if (row.student_id === studentBId && !sessionBId) sessionBId = row.id;
    }

    if (!sessionAId || !sessionBId) {
      console.log('Creating test sessions for both students...');
      const client = await pool.connect();
      try {
        if (!sessionAId) {
          const r = await client.query(
            `INSERT INTO realtime_sessions (id, user_id, student_id, status, age_group, subject, language) VALUES (gen_random_uuid(), $1, $2, 'completed', '3-5', 'Math', 'en') RETURNING id`,
            [testUserId, studentAId]
          );
          sessionAId = r.rows[0].id;
        }
        if (!sessionBId) {
          const r = await client.query(
            `INSERT INTO realtime_sessions (id, user_id, student_id, status, age_group, subject, language) VALUES (gen_random_uuid(), $1, $2, 'completed', 'K-2', 'English', 'en') RETURNING id`,
            [testUserId, studentBId]
          );
          sessionBId = r.rows[0].id;
        }
      } finally {
        client.release();
      }
    }

    console.log(`Session A: ${sessionAId}`);
    console.log(`Session B: ${sessionBId}\n`);

    console.log('1. Clearing any existing summaries for test sessions and inserting...');
    await pool.query(`DELETE FROM session_summaries WHERE session_id IN ($1, $2)`, [sessionAId, sessionBId]);

    await pool.query(`
      INSERT INTO session_summaries (id, user_id, student_id, session_id, summary_text, topics_covered, concepts_mastered, concepts_struggled, student_insights, subject, grade_band, duration_minutes)
      VALUES ($1, $2, $3, $4, 'Student A practiced multiplication tables, focusing on 6x, 7x, and 8x.', ARRAY['multiplication', 'times tables'], ARRAY['6x table'], ARRAY['8x table'], 'Visual learner', 'Math', '3-5', 15)
    `, [SUMMARY_A_ID, testUserId, studentAId, sessionAId]);

    await pool.query(`
      INSERT INTO session_summaries (id, user_id, student_id, session_id, summary_text, topics_covered, concepts_mastered, concepts_struggled, student_insights, subject, grade_band, duration_minutes)
      VALUES ($1, $2, $3, $4, 'Student B worked on reading comprehension with short stories.', ARRAY['reading comprehension', 'vocabulary'], ARRAY['main idea identification'], ARRAY['inference'], 'Auditory learner', 'English', 'K-2', 10)
    `, [SUMMARY_B_ID, testUserId, studentBId, sessionBId]);

    console.log('\n--- Test Cases ---\n');

    console.log('TEST 1: Query summaries for Student A only');
    const summariesA = await getRecentSessionSummaries({
      userId: testUserId,
      studentId: studentAId,
      limit: 5
    });
    
    const aHasBData = summariesA.some(s => s.studentId === studentBId);
    if (!aHasBData) {
      console.log('  PASS: Student A query excludes Student B data');
      passed++;
    } else {
      console.log(`  FAIL: Student A query includes B data! ids=[${summariesA.map(s => s.studentId).join(',')}]`);
      failed++;
    }

    const testSummaryA = summariesA.find(s => s.id === SUMMARY_A_ID);
    if (testSummaryA) {
      console.log('  PASS: Found our test summary for Student A');
      passed++;
    } else {
      console.log('  FAIL: Test summary for A not found in results');
      failed++;
    }

    console.log('\nTEST 2: Query summaries for Student B only');
    const summariesB = await getRecentSessionSummaries({
      userId: testUserId,
      studentId: studentBId,
      limit: 5
    });
    
    const bHasAData = summariesB.some(s => s.studentId === studentAId);
    if (!bHasAData) {
      console.log('  PASS: Student B query excludes Student A data');
      passed++;
    } else {
      console.log(`  FAIL: Student B query includes A data! ids=[${summariesB.map(s => s.studentId).join(',')}]`);
      failed++;
    }

    const testSummaryB = summariesB.find(s => s.id === SUMMARY_B_ID);
    if (testSummaryB) {
      console.log('  PASS: Found our test summary for Student B');
      passed++;
    } else {
      console.log('  FAIL: Test summary for B not found in results');
      failed++;
    }

    console.log('\nTEST 3: Continuity block isolation');
    const blockA = buildContinuityBlock(summariesA);
    const blockB = buildContinuityBlock(summariesB);

    if (!blockA.includes('reading comprehension')) {
      console.log('  PASS: A continuity block does not contain B topics');
      passed++;
    } else {
      console.log('  FAIL: A block contains B content');
      failed++;
    }

    if (!blockB.includes('multiplication')) {
      console.log('  PASS: B continuity block does not contain A topics');
      passed++;
    } else {
      console.log('  FAIL: B block contains A content');
      failed++;
    }

    console.log('\nTEST 4: Null studentId isolation (sessions without student profile)');
    const summariesNull = await getRecentSessionSummaries({
      userId: testUserId!,
      studentId: null,
      limit: 5
    });
    const nullHasA = summariesNull.some(s => s.studentId === studentAId);
    const nullHasB = summariesNull.some(s => s.studentId === studentBId);
    if (!nullHasA && !nullHasB) {
      console.log('  PASS: Null studentId query returns only null-studentId summaries');
      passed++;
    } else {
      console.log(`  FAIL: Null studentId query leaked student data! hasA=${nullHasA} hasB=${nullHasB}`);
      failed++;
    }

    console.log('\nTEST 5: Cross-user isolation (different user cannot access summaries)');
    const fakeUserId = 'fake-user-' + suffix;
    const summariesCrossUser = await getRecentSessionSummaries({
      userId: fakeUserId,
      studentId: studentAId,
      limit: 5
    });
    if (summariesCrossUser.length === 0) {
      console.log('  PASS: Different user cannot access Student A summaries');
      passed++;
    } else {
      console.log(`  FAIL: Cross-user leak! Found ${summariesCrossUser.length} summaries for fake user`);
      failed++;
    }

    console.log('\nTEST 6: Continuity block positive content verification');
    if (blockA.includes('multiplication') || blockA.includes('times tables')) {
      console.log('  PASS: A block contains expected A topics (multiplication/times tables)');
      passed++;
    } else {
      console.log(`  FAIL: A block missing expected topics. Content: ${blockA.substring(0, 100)}`);
      failed++;
    }
    if (blockB.includes('reading comprehension') || blockB.includes('vocabulary')) {
      console.log('  PASS: B block contains expected B topics (reading/vocabulary)');
      passed++;
    } else {
      console.log(`  FAIL: B block missing expected topics. Content: ${blockB.substring(0, 100)}`);
      failed++;
    }

    console.log('\nTEST 7: Error path returns empty array (safe fallback)');
    const summariesBadUser = await getRecentSessionSummaries({
      userId: '',
      studentId: 'nonexistent-student-id',
      limit: 5
    });
    if (Array.isArray(summariesBadUser) && summariesBadUser.length === 0) {
      console.log('  PASS: Invalid params return empty array (safe fallback)');
      passed++;
    } else {
      console.log(`  FAIL: Invalid params did not return empty array`);
      failed++;
    }

  } catch (error) {
    console.error('Test execution error:', error);
    failed++;
  } finally {
    console.log('\nCleaning up test data...');
    try {
      await pool.query(`DELETE FROM session_summaries WHERE id IN ($1, $2)`, [SUMMARY_A_ID, SUMMARY_B_ID]);
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) {
      console.log('STUDENT ISOLATION TEST FAILED');
      process.exit(1);
    } else {
      console.log('ALL STUDENT ISOLATION TESTS PASSED');
      process.exit(0);
    }
  }
}

testStudentIsolation();

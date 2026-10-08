require('dotenv').config();
const { pool } = require('../db-postgres');

async function cleanFakeData() {
  console.log('Cleaning up fake data and test attempts...');

  // 1. Delete all attempts and seen questions
  await pool.query('DELETE FROM attempts');
  await pool.query('DELETE FROM user_seen_questions');

  // 2. Delete dummy test user 'candidate_4248' (Aditya Aspirant)
  await pool.query('DELETE FROM users WHERE LOWER(user_id) = $1', ['candidate_4248']);

  // 3. Reset login counts and last_login_at
  await pool.query('UPDATE users SET login_count = 0, last_login_at = NULL, last_ip = NULL');
  await pool.query('DELETE FROM login_logs');

  const users = await pool.query('SELECT id, name, user_id, email, role FROM users');
  console.log('Clean active users in system:');
  console.table(users.rows);

  const attempts = await pool.query('SELECT count(*) FROM attempts');
  console.log('Attempts count:', attempts.rows[0].count);

  await pool.end();
}

cleanFakeData().catch(console.error);

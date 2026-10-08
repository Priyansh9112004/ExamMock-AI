require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Running admin & tracking migration...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        identifier TEXT NOT NULL,
        user_name TEXT,
        status TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_login_logs_time ON login_logs(created_at DESC);

      UPDATE users SET role = 'admin' WHERE LOWER(user_id) = 'naitik7660' OR LOWER(email) LIKE '%naitik%';
    `);

    const users = await pool.query('SELECT user_id, name, email, role, last_login_at, login_count FROM users');
    console.log('Updated users:');
    console.table(users.rows);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();

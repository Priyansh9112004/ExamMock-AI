require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db-postgres');

async function createAdmin() {
  const hash = await bcrypt.hash('admin123', 12);
  const uid = crypto.randomUUID();

  // Check if admin@123 already exists
  const existing = await pool.query(
    'SELECT * FROM users WHERE LOWER(user_id) = LOWER($1) OR LOWER(email) = LOWER($1)',
    ['admin@123']
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE users SET password_hash = $1, role = $2 WHERE id = $3',
      [hash, 'admin', existing.rows[0].id]
    );
    console.log('Updated existing admin user:', existing.rows[0].user_id);
  } else {
    await pool.query(
      'INSERT INTO users (id, name, user_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6)',
      [uid, 'Administrator', 'admin@123', 'admin@exammock.ai', hash, 'admin']
    );
    console.log('Created admin user: admin@123');
  }

  const u = await pool.query('SELECT id, name, user_id, email, role FROM users WHERE user_id = $1', ['admin@123']);
  console.log('Admin user verified:', u.rows[0]);
  await pool.end();
}

createAdmin().catch(console.error);

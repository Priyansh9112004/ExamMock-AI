const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createUser, getUserByIdentifier, getUserById } = require('./database');
const { userError } = require('./errors');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET missing/too short. Generate: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 12);

const limiter = (limit, windowMs, error, extra = {}) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { ok: false, error }, ...extra });

const loginLimiter = limiter(10, 15 * 60 * 1000, 'Too many failed logins. Try again in 15 minutes.', { skipSuccessfulRequests: true });
const registerLimiter = limiter(5, 60 * 60 * 1000, 'Too many sign-ups from this network. Try again later.');

function token(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, userId: user.user_id, email: user.email },
    JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const raw = req.headers.authorization || '';
  const t = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!t) return res.status(401).json({ ok: false, error: 'Login required' });
  try {
    req.auth = jwt.verify(t, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Session expired. Please login again.' });
  }
}

const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()) && String(v).length <= 254;
const validUserId = v => /^[A-Za-z0-9_]{3,25}$/.test(String(v || '').trim());

function sendAuthError(res, e) {
  if (e.expose) return res.status(e.status || 400).json({ ok: false, error: e.message });
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(400).json({ ok: false, error: 'User ID or email is already registered' });
  }
  console.error('[AUTH]', e);
  res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
}

function routes(app) {
  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const userId = String(req.body.userId || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');

      if (name.length < 2 || name.length > 80) throw userError('Enter your name (2-80 characters)');
      if (!validUserId(userId)) throw userError('User ID must be 3-25 characters: letters, numbers or underscore only');
      if (!validEmail(email)) throw userError('Enter a valid email address');
      if (password.length < 8) throw userError('Password must be at least 8 characters');
      if (Buffer.byteLength(password) > 72) throw userError('Password is too long (max 72 bytes)');
      if (getUserByIdentifier(userId) || getUserByIdentifier(email)) {
        throw userError('User ID or email is already registered');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = createUser({ name, userId, email, passwordHash });
      res.json({ ok: true, token: token(user), user });
    } catch (e) { sendAuthError(res, e); }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
      const identifier = String(req.body.identifier || '').trim().slice(0, 254);
      const u = identifier ? getUserByIdentifier(identifier) : null;
      const ok = await bcrypt.compare(String(req.body.password || ''), u ? u.password_hash : DUMMY_HASH);
      if (!u || !ok) throw userError('Invalid User ID/email or password', 401);
      const user = getUserById(u.id);
      res.json({ ok: true, token: token(user), user });
    } catch (e) { sendAuthError(res, e); }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = getUserById(req.auth.sub);
    if (!user) return res.status(401).json({ ok: false, error: 'Account not found' });
    res.json({ ok: true, user });
  });
}

module.exports = { routes, requireAuth };

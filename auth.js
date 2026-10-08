const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { 
  createUser, 
  getUserByIdentifier, 
  getUserById,
  recordLogin,
  getAdminOverview,
  getAdminUsers,
  getAdminLoginLogs,
  getAdminAttempts
} = require('./database');
const { userError } = require('./errors');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET missing/too short. Generate: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 12);

const limiter = (limit, windowMs, error, extra = {}) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { ok: false, error }, ...extra });

const loginLimiter = limiter(20, 15 * 60 * 1000, 'Too many failed logins. Try again in 15 minutes.', { skipSuccessfulRequests: true });
const registerLimiter = limiter(10, 60 * 60 * 1000, 'Too many sign-ups from this network. Try again later.');

function token(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, userId: user.user_id || user.userId, email: user.email, role: user.role || 'user' },
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

function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    if (req.auth && req.auth.role === 'admin') {
      return next();
    }
    try {
      const u = await getUserById(req.auth.sub);
      if (u && u.role === 'admin') {
        req.auth.role = 'admin';
        return next();
      }
    } catch {}
    return res.status(403).json({ ok: false, error: 'Admin access required. You do not have permission to view this panel.' });
  });
}

const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()) && String(v).length <= 254;
const validUserId = v => /^[A-Za-z0-9_@.-]{3,35}$/.test(String(v || '').trim());

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
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip || '').slice(0, 60);
    const ua = (req.headers['user-agent'] || '').slice(0, 250);
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
      if ((await getUserByIdentifier(userId)) || (await getUserByIdentifier(email))) {
        throw userError('User ID or email is already registered');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await createUser({ name, userId, email, passwordHash });
      if (recordLogin) {
        await recordLogin({ userId: user.id, identifier: user.user_id, userName: user.name, status: 'SUCCESS', ip, userAgent: ua });
      }
      res.json({ ok: true, token: token(user), user });
    } catch (e) { sendAuthError(res, e); }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const identifier = String(req.body.identifier || '').trim().slice(0, 254);
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip || '').slice(0, 60);
    const ua = (req.headers['user-agent'] || '').slice(0, 250);
    try {
      const u = identifier ? await getUserByIdentifier(identifier) : null;
      const ok = await bcrypt.compare(String(req.body.password || ''), u ? u.password_hash : DUMMY_HASH);
      if (!u || !ok) {
        if (recordLogin) {
          await recordLogin({ userId: u?.id || null, identifier, userName: u?.name || null, status: 'FAILED', ip, userAgent: ua });
        }
        throw userError('Invalid User ID/email or password', 401);
      }
      const user = await getUserById(u.id);
      if (recordLogin) {
        await recordLogin({ userId: user.id, identifier, userName: user.name, status: 'SUCCESS', ip, userAgent: ua });
      }
      res.json({ ok: true, token: token(user), user });
    } catch (e) { sendAuthError(res, e); }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const user = await getUserById(req.auth.sub);
    if (!user) return res.status(401).json({ ok: false, error: 'Account not found' });
    res.json({ ok: true, user });
  });

  // Admin APIs
  app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    try {
      const overview = await getAdminOverview();
      res.json({ ok: true, overview });
    } catch (e) { sendAuthError(res, e); }
  });

  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = await getAdminUsers();
      res.json({ ok: true, users });
    } catch (e) { sendAuthError(res, e); }
  });

  app.get('/api/admin/login-logs', requireAdmin, async (req, res) => {
    try {
      const logs = await getAdminLoginLogs(req.query.limit);
      res.json({ ok: true, logs });
    } catch (e) { sendAuthError(res, e); }
  });

  app.get('/api/admin/attempts', requireAdmin, async (req, res) => {
    try {
      const attempts = await getAdminAttempts(req.query.limit);
      res.json({ ok: true, attempts });
    } catch (e) { sendAuthError(res, e); }
  });
}

module.exports = { routes, requireAuth, requireAdmin };

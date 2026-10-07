function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

const UNIT_MS = { ms: 1, s: 1e3, m: 6e4, h: 36e5 };
const DUR = '((?:\\d+(?:\\.\\d+)?(?:ms|h|m|s))+)';

function parseRetryMs(err) {
  if (Number.isFinite(err?.retryAfterMs) && err.retryAfterMs > 0) return err.retryAfterMs;
  const ms = Number(headerValue(err?.headers, 'retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const sec = Number(headerValue(err?.headers, 'retry-after'));
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;

  const msg = String(err?.message || '');
  const m = msg.match(new RegExp(`(?:try again|retry) in\\s+${DUR}`, 'i'))
         || msg.match(new RegExp(`retryDelay\\W+${DUR}`, 'i'));
  if (!m) return null;
  let total = 0;
  for (const [, n, u] of m[1].matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/gi)) total += Number(n) * UNIT_MS[u.toLowerCase()];
  return total > 0 ? total : null;
}

function isRateLimit(err) {
  return Number(err?.status) === 429
    || String(err?.code || '').toLowerCase() === 'rate_limit_exceeded'
    || /rate limit|too many requests|resource_exhausted|quota/i.test(String(err?.message || ''));
}

module.exports = { parseRetryMs, isRateLimit };

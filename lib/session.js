import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'attendance_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

if (!SECRET) throw new Error('Missing JWT_SECRET in .env');

export function signSession(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: MAX_AGE_SECONDS });
}

export function verifySession(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

export function setSessionCookie(res, payload) {
  const token = signSession(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
  );
  return token;
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

export function getSessionFromRequest(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySession(match[1]);
}

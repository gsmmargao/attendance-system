import { getSessionFromRequest } from './session.js';

export function api(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      return await handler(req, res);
    } catch (err) {
      console.error('[API ERROR]', err);
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  };
}

export function requireRole(role) {
  return (handler) => api(async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    if (role && session.role !== role) return res.status(403).json({ error: 'Forbidden' });
    req.session = session;
    return handler(req, res);
  });
}

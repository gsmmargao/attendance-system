import { clearSessionCookie } from '../../lib/session.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

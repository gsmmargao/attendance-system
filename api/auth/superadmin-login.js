import { supabase } from '../../lib/supabase.js';
import { setSessionCookie } from '../../lib/session.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  const { data: sa, error } = await supabase
    .from('superadmins')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle();

  if (error || !sa) return res.status(401).json({ error: 'Access Denied' });

  setSessionCookie(res, { role: 'superadmin', id: sa.id, email: sa.email });

  await supabase.from('audit_logs').insert([{
    admin_id: sa.id,
    action: 'Superadmin Login',
    details: { email: sa.email }
  }]).then(() => {}).catch(() => {});

  return res.json({ ok: true, email: sa.email, name: sa.name });
});

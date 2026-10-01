import { supabase } from '../../lib/supabase.js';
import { setSessionCookie } from '../../lib/session.js';
import { api } from '../../lib/auth.js';
import { evaluateAdminSubscription } from '../../lib/subscription.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle();

  if (error || !admin) return res.status(401).json({ error: 'Invalid Admin ID or Password' });

  // Email must be verified (unless it's the seed admin style with no real email)
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email);
  if (looksLikeEmail && !admin.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email first. Check your inbox or request a new code.',
      code: 'EMAIL_NOT_VERIFIED',
      email: admin.email
    });
  }

  setSessionCookie(res, { role: 'admin', id: admin.id, email: admin.email });

  await supabase.from('audit_logs').insert([{
    admin_id: admin.id,
    action: 'Admin Login',
    details: { email: admin.email }
  }]).then(() => {}).catch(() => {});

  const sub = evaluateAdminSubscription(admin);

  return res.json({
    ok: true,
    admin: {
      id: admin.id,
      firm_name: admin.firm_name,
      email: admin.email,
      employee_limit: admin.employee_limit,
      grace_period_mins: admin.grace_period_mins,
      standard_hours: admin.standard_hours,
      ot_multiplier: admin.ot_multiplier,
      geo_lat: admin.geo_lat,
      geo_lng: admin.geo_lng,
      geo_radius: admin.geo_radius,
      weekly_offs: admin.weekly_offs,
      subscription: sub
    }
  });
});

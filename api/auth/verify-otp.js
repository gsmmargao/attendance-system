import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { setSessionCookie } from '../../lib/session.js';
import { evaluateAdminSubscription } from '../../lib/subscription.js';

const MAX_ATTEMPTS = 5;

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, otp_code } = req.body || {};
  if (!email || !otp_code) return res.status(400).json({ error: 'Email and code required' });

  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp_code).trim();

  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error || !admin) return res.status(404).json({ error: 'Account not found' });

  if (admin.email_verified) {
    return res.status(400).json({ error: 'Email already verified. Please log in.' });
  }

  // Check attempts
  if ((admin.otp_attempts || 0) >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
  }

  // Check expiry
  if (!admin.otp_expires_at || new Date(admin.otp_expires_at) < new Date()) {
    return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  }

  // Check match
  if (admin.otp_code !== cleanOtp) {
    await supabase
      .from('admins')
      .update({ otp_attempts: (admin.otp_attempts || 0) + 1 })
      .eq('id', admin.id);
    const remaining = MAX_ATTEMPTS - (admin.otp_attempts || 0) - 1;
    return res.status(400).json({ error: `Invalid code. ${remaining} attempts remaining.` });
  }

  // Success — mark verified and clear OTP
  const { error: upErr } = await supabase
    .from('admins')
    .update({
      email_verified: true,
      verified_at: new Date().toISOString(),
      otp_code: null,
      otp_expires_at: null,
      otp_attempts: 0
    })
    .eq('id', admin.id);

  if (upErr) return res.status(500).json({ error: upErr.message });

  // Auto login the user
  setSessionCookie(res, { role: 'admin', id: admin.id, email: admin.email });

  await supabase.from('audit_logs').insert([{
    admin_id: admin.id,
    action: 'Admin Signup Verified',
    details: { email: admin.email }
  }]).then(() => {}).catch(() => {});

  const sub = evaluateAdminSubscription({ ...admin, email_verified: true });

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

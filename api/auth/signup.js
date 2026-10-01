import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { sendOtpEmail, generateOtp } from '../../lib/email.js';

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firm_name, email, password, employee_limit } = req.body || {};

  // Validation
  if (!firm_name || firm_name.trim().length < 2) {
    return res.status(400).json({ error: 'Firm name must be at least 2 characters' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanFirm = firm_name.trim();
  const limit = parseInt(employee_limit) || 10;

  // Check if email exists
  const { data: existing } = await supabase
    .from('admins')
    .select('id, email_verified')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (existing && existing.email_verified) {
    return res.status(400).json({ error: 'This email is already registered. Please log in.' });
  }

  const otp = generateOtp();
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60000).toISOString();
  const now = new Date().toISOString();

  const payload = {
    firm_name: cleanFirm,
    email: cleanEmail,
    password,
    employee_limit: limit,
    email_verified: false,
    otp_code: otp,
    otp_expires_at: otpExpiresAt,
    otp_attempts: 0,
    otp_last_sent_at: now,
    trial_started_at: now,
    subscription_status: 'trial',
    subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
  };

  let adminId;
  if (existing) {
    // Update existing unverified row (resend flow)
    const { data, error } = await supabase
      .from('admins')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    adminId = data.id;
  } else {
    const { data, error } = await supabase
      .from('admins')
      .insert([payload])
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    adminId = data.id;
  }

  // Send OTP email
  try {
    await sendOtpEmail(cleanEmail, otp, cleanFirm);
  } catch (err) {
    console.error('[signup] email error:', err);
    return res.status(500).json({
      error: 'Account created but OTP email failed. Please use "Resend OTP" from the login page.'
    });
  }

  return res.json({
    ok: true,
    admin_id: adminId,
    email: cleanEmail,
    message: 'Check your email for the verification code'
  });
});

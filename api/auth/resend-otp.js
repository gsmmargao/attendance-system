import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { sendOtpEmail, generateOtp } from '../../lib/email.js';

const COOLDOWN_SECONDS = 60;
const OTP_TTL_MINUTES = 10;

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  const cleanEmail = email.trim().toLowerCase();

  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (!admin) return res.status(404).json({ error: 'Account not found' });
  if (admin.email_verified) return res.status(400).json({ error: 'Already verified. Please log in.' });

  // Cooldown check
  if (admin.otp_last_sent_at) {
    const elapsed = (Date.now() - new Date(admin.otp_last_sent_at).getTime()) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting again.` });
    }
  }

  const otp = generateOtp();
  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from('admins')
    .update({
      otp_code: otp,
      otp_expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60000).toISOString(),
      otp_attempts: 0,
      otp_last_sent_at: now
    })
    .eq('id', admin.id);

  if (upErr) return res.status(500).json({ error: upErr.message });

  try {
    await sendOtpEmail(cleanEmail, otp, admin.firm_name || 'there');
  } catch (err) {
    console.error('[resend-otp] email error:', err);
    return res.status(500).json({ error: 'Email send failed: ' + err.message });
  }

  return res.json({ ok: true, message: 'New code sent to your email' });
});

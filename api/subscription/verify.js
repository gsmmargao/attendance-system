import crypto from 'crypto';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

const PLAN_DAYS = { monthly: 30, yearly: 365, enterprise: 365 };

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay fields' });
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid signature — payment not verified' });
  }

  // Determine plan from the pending record
  const { data: admin } = await supabase
    .from('admins').select('subscription_plan').eq('id', session.id).single();
  const plan = admin?.subscription_plan || 'monthly';
  const days = PLAN_DAYS[plan] || 30;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const { error } = await supabase.from('admins').update({
    subscription_status: 'active',
    subscription_plan: plan,
    subscription_expires_at: expiresAt,
    payment_note: `Paid: ${razorpay_payment_id}`
  }).eq('id', session.id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('audit_logs').insert([{
    admin_id: session.id,
    action: 'Subscription Activated',
    details: { plan, razorpay_order_id, razorpay_payment_id, expiresAt }
  }]).then(() => {}).catch(() => {});

  return res.json({ ok: true, plan, expiresAt });
});

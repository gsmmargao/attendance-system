import crypto from 'crypto';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

// Plan duration in days
const PLAN_DAYS = { monthly: 30, yearly: 365, enterprise: 365 };

// Plan employee limits — auto-applied when payment verified
const PLAN_LIMITS = { monthly: 10, yearly: 20, enterprise: null };

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

  const { data: admin } = await supabase
    .from('admins')
    .select('subscription_plan, employee_limit')
    .eq('id', session.id)
    .single();

  const plan = admin?.subscription_plan || 'monthly';
  const days = PLAN_DAYS[plan] || 30;
  const planLimit = PLAN_LIMITS[plan];

  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const updatePayload = {
    subscription_status: 'active',
    subscription_plan: plan,
    subscription_expires_at: expiresAt,
    payment_note: `Paid: ${razorpay_payment_id}`
  };

  // Auto-apply plan employee limit if defined
  if (planLimit !== null && planLimit !== undefined) {
    updatePayload.employee_limit = planLimit;
  }

  const { error } = await supabase
    .from('admins')
    .update(updatePayload)
    .eq('id', session.id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('audit_logs').insert([{
    admin_id: session.id,
    action: 'Subscription Activated',
    details: { plan, razorpay_order_id, razorpay_payment_id, expiresAt, employee_limit: planLimit }
  }]).then(() => {}).catch(() => {});

  return res.json({
    ok: true,
    plan,
    expiresAt,
    employee_limit: planLimit
  });
});

import crypto from 'crypto';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

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
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const now = new Date();
  const nextBilling = new Date(now.getTime() + 30 * 86400000);

  const { error } = await supabase.from('admins').update({
    setup_fee_paid: true,
    setup_fee_paid_at: now.toISOString(),
    subscription_status: 'active',
    subscription_expires_at: nextBilling.toISOString(),
    next_billing_date: nextBilling.toISOString().split('T')[0],
    due_date: nextBilling.toISOString().split('T')[0],
    amount_due: 0,
    account_blocked: false,
    blocked_reason: null,
    last_payment_at: now.toISOString(),
    last_payment_amount: 2360,
    last_payment_type: 'setup'
  }).eq('id', session.id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('billing_history')
    .update({ status: 'paid', razorpay_payment_id })
    .eq('razorpay_order_id', razorpay_order_id);

  await supabase.from('audit_logs').insert([{
    admin_id: session.id,
    action: 'Setup Fee Paid',
    details: { razorpay_order_id, razorpay_payment_id }
  }]).then(() => {}).catch(() => {});

  return res.json({ ok: true, next_billing_date: nextBilling.toISOString().split('T')[0] });
});

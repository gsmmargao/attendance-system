import Razorpay from 'razorpay';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

const PLANS = {
  monthly:    { amount: 499,  duration: 30  },
  yearly:     { amount: 4999, duration: 365 },
  enterprise: { amount: 0,    duration: 365 }
};

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { plan } = req.body || {};
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (plan === 'enterprise') return res.status(400).json({ error: 'Enterprise is contact-only' });

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay keys not configured on server' });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  try {
    const order = await razorpay.orders.create({
      amount: PLANS[plan].amount * 100, // paise
      currency: 'INR',
      receipt: `admin_${session.id}_${Date.now()}`,
      notes: { admin_id: session.id, plan }
    });

    await supabase.from('admins').update({
      subscription_status: 'pending_payment',
      subscription_plan: plan,
      payment_note: `Razorpay order ${order.id}`
    }).eq('id', session.id);

    return res.json({
      ok: true,
      order,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: PLANS[plan].amount,
      plan
    });
  } catch (err) {
    console.error('[Razorpay] create-order error:', err);
    return res.status(500).json({ error: err.message || 'Order creation failed' });
  }
});

import Razorpay from 'razorpay';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { calculateMonthlyFee } from '../../lib/billing.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  if (!admin.setup_fee_paid) {
    return res.status(400).json({ error: 'Please pay setup fee first' });
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }

  // Count current employees
  const { count } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('admin_id', session.id);

  const employeeCount = count || 0;
  if (employeeCount < 1) {
    return res.status(400).json({ error: 'Add at least one employee before monthly payment' });
  }

  const fee = calculateMonthlyFee(employeeCount);
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const order = await razorpay.orders.create({
    amount: Math.round(fee.total * 100),
    currency: 'INR',
    receipt: `monthly_${session.id}_${Date.now()}`,
    notes: {
      admin_id: session.id,
      payment_type: 'monthly',
      employee_count: employeeCount,
      base: fee.base,
      gst: fee.gst
    }
  });

  await supabase.from('billing_history').insert([{
    admin_id: session.id,
    payment_type: 'monthly',
    base_amount: fee.base,
    gst_amount: fee.gst,
    total_amount: fee.total,
    employee_count: employeeCount,
    razorpay_order_id: order.id,
    status: 'pending',
    period_start: admin.due_date || new Date().toISOString().split('T')[0]
  }]);

  return res.json({
    ok: true,
    order,
    keyId: process.env.RAZORPAY_KEY_ID,
    fee,
    type: 'monthly',
    employeeCount
  });
});

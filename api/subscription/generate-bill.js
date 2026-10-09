import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { calculateMonthlyFee } from '../../lib/billing.js';
import { Resend } from 'resend';

export default api(async (req, res) => {
  const cronHeader = req.headers['x-vercel-cron'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cronHeader) return res.status(403).json({ error: 'Cron only' });

  const today = new Date().toISOString().split('T')[0];

  // Find admins whose due_date is today or overdue, with setup paid, not blocked
  const { data: admins } = await supabase
    .from('admins')
    .select('*')
    .eq('setup_fee_paid', true)
    .eq('account_blocked', false)
    .lte('due_date', today);

  const results = [];

  for (const admin of admins || []) {
    const { count } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('admin_id', admin.id);

    const employeeCount = count || 0;
    const fee = calculateMonthlyFee(employeeCount);

    await supabase.from('admins').update({
      amount_due: fee.total,
      employee_count_at_billing: employeeCount
    }).eq('id', admin.id);

    // Send email reminder
    if (admin.email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
          to: admin.email,
          subject: `Monthly Bill — ₹${fee.total.toFixed(0)} due`,
          html: `
            <h2>Monthly Billing</h2>
            <p>Hi ${admin.firm_name},</p>
            <p>Your monthly bill for ${employeeCount} employees:</p>
            <ul>
              <li>Base: ₹${fee.base.toFixed(2)} (${employeeCount} × ₹${fee.ratePerEmployee})</li>
              <li>GST (18%): ₹${fee.gst.toFixed(2)}</li>
              <li><b>Total: ₹${fee.total.toFixed(2)}</b></li>
            </ul>
            <p>Due date: ${admin.due_date}</p>
            <p><a href="${process.env.APP_URL}/admin.html">Pay now</a></p>
          `
        });
      } catch (e) {
        console.error('Email error for', admin.email, e.message);
      }
    }

    results.push({ admin_id: admin.id, amount_due: fee.total, employees: employeeCount });
  }

  return res.json({ ok: true, generated: results.length, results });
});

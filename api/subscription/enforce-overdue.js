import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  const cronHeader = req.headers['x-vercel-cron'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cronHeader) return res.status(403).json({ error: 'Cron only' });

  const now = new Date();

  const { data: admins } = await supabase
    .from('admins')
    .select('*')
    .eq('setup_fee_paid', true)
    .eq('account_blocked', false)
    .gt('amount_due', 0);

  const blocked = [];

  for (const admin of admins || []) {
    const grace = admin.grace_period_days || 5;
    const graceEnd = new Date(new Date(admin.due_date).getTime() + grace * 86400000);

    if (now > graceEnd) {
      await supabase.from('admins').update({
        account_blocked: true,
        blocked_reason: `Payment overdue — ₹${Number(admin.amount_due).toFixed(0)} due since ${admin.due_date}`,
        blocked_at: now.toISOString()
      }).eq('id', admin.id);
      blocked.push({ admin_id: admin.id, amount: admin.amount_due });
    }
  }

  return res.json({ ok: true, blockedCount: blocked.length, blocked });
});

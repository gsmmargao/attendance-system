import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  // Simple auth: Vercel cron sends this header automatically
  const cronHeader = req.headers['x-vercel-cron'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cronHeader) {
    return res.status(403).json({ error: 'Cron only' });
  }

  const now = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from('admins')
    .update({ subscription_status: 'expired' })
    .lt('subscription_expires_at', now)
    .eq('subscription_status', 'active')
    .select('id, email, subscription_plan, subscription_expires_at');

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    ok: true,
    checkedAt: now,
    expiredCount: expired?.length || 0,
    expired: expired || []
  });
});

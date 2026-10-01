import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { evaluateAdminSubscription } from '../../lib/subscription.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  return res.json({ subscription: evaluateAdminSubscription(admin) });
});

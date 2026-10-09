import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { evaluateBillingState } from '../../lib/billing.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const state = evaluateBillingState(admin);

  // Get recent billing history
  const { data: history } = await supabase
    .from('billing_history')
    .select('*')
    .eq('admin_id', session.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return res.json({
    billing: state,
    history: history || []
  });
});

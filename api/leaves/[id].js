import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('leaves').delete().eq('id', id).eq('admin_id', session.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

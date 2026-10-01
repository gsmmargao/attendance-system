import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data } = await supabase.from('admins').select('*').eq('id', session.id).single();
    return res.json({ settings: data });
  }

  if (req.method === 'PATCH') {
    // Whitelist updatable fields
    const allowed = ['geo_lat', 'geo_lng', 'geo_radius', 'weekly_offs',
                     'standard_hours', 'ot_multiplier', 'grace_period_mins',
                     'firm_name', 'password'];
    const update = {};
    for (const k of allowed) {
      if (k in req.body) update[k] = req.body[k];
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid fields' });

    const { data, error } = await supabase.from('admins').update(update).eq('id', session.id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Settings Updated',
      details: update
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, admin: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

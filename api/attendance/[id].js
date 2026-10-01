import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'PATCH') {
    const { data, error } = await supabase
      .from('attendance')
      .update(req.body || {})
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Attendance Corrected',
      details: { record_id: id, patch: req.body }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, record: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

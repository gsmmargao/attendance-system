import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const date = req.query.date || new Date().toISOString().split('T')[0];

  const { data: employees } = await supabase
    .from('employees').select('id, name').eq('admin_id', session.id);
  const empIds = (employees || []).map(e => e.id);

  if (!empIds.length) return res.json({ date, attendance: [] });

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', date)
    .in('employee_id', empIds);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ date, attendance: data || [] });
});

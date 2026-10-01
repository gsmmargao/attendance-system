import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { employee_id, date } = req.query;
  if (!employee_id || !date) return res.status(400).json({ error: 'employee_id and date required' });

  // Verify employee belongs to this admin
  const { data: emp } = await supabase.from('employees').select('admin_id').eq('id', employee_id).single();
  if (!emp || emp.admin_id !== session.id) return res.status(403).json({ error: 'Not your employee' });

  // Look at the day before through day after to catch overnight shifts
  const d = new Date(date);
  const gte = new Date(d); gte.setDate(gte.getDate() - 1);
  const lte = new Date(d); lte.setDate(lte.getDate() + 2);

  const { data, error } = await supabase
    .from('attendance_photos')
    .select('photo_url, punch_type, created_at')
    .eq('employee_id', employee_id)
    .gte('created_at', gte.toISOString())
    .lte('created_at', lte.toISOString())
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const inPhoto = (data || []).find(p => p.punch_type === 'in');
  const outPhoto = [...(data || [])].reverse().find(p => p.punch_type === 'out');

  return res.json({
    in_url: inPhoto?.photo_url || null,
    out_url: outPhoto?.photo_url || null
  });
});

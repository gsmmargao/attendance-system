import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('holidays').select('*').eq('admin_id', session.id)
      .order('holiday_date', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ holidays: data || [] });
  }

  if (req.method === 'POST') {
    const { holiday_date, name, target } = req.body || {};
    if (!holiday_date) return res.status(400).json({ error: 'holiday_date required' });

    // Save holiday
    const { error: holErr } = await supabase.from('holidays').insert([{
      admin_id: session.id,
      holiday_date,
      name: name || 'Holiday'
    }]);
    if (holErr && holErr.code !== '23505') return res.status(500).json({ error: holErr.message });

    // Determine target employee ids
    let empIds = [];
    if (target && target !== 'all') {
      empIds = [target];
    } else {
      const { data: emps } = await supabase.from('employees').select('id').eq('admin_id', session.id);
      empIds = (emps || []).map(e => e.id);
    }

    if (empIds.length) {
      const attendancePayloads = empIds.map(empId => ({
        employee_id: empId,
        date: holiday_date,
        status: 'Paid Leave',
        punches: [], total_hours: 0,
        is_manual_override: true,
        notes: `Holiday: ${name || 'Holiday'}`
      }));
      await supabase.from('attendance').upsert(attendancePayloads, { onConflict: 'employee_id, date' });

      const leavePayloads = empIds.map(empId => ({
        admin_id: session.id,
        employee_id: empId,
        leave_date: holiday_date,
        leave_type: 'Paid Leave',
        reason: `Holiday: ${name || 'Holiday'}`,
        status: 'Approved'
      }));
      await supabase.from('leaves').insert(leavePayloads);
    }

    return res.json({ ok: true, appliedTo: empIds.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

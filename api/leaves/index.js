import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('leaves').select('*').eq('admin_id', session.id)
      .order('leave_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ leaves: data || [] });
  }

  if (req.method === 'POST') {
    const { employee_id, leave_date, leave_type, reason } = req.body || {};
    if (!employee_id || !leave_date) {
      return res.status(400).json({ error: 'employee_id and leave_date required' });
    }

    const { error: leaveErr } = await supabase.from('leaves').insert([{
      admin_id: session.id,
      employee_id,
      leave_date,
      leave_type: leave_type || 'Paid Leave',
      reason: reason || 'Scheduled Leave',
      status: 'Approved'
    }]);
    if (leaveErr) return res.status(500).json({ error: leaveErr.message });

    // Mark attendance for that date
    await supabase.from('attendance').upsert([{
      employee_id, date: leave_date,
      status: leave_type || 'Paid Leave',
      punches: [], total_hours: 0,
      is_manual_override: true,
      notes: `Leave: ${reason || leave_type || 'Paid Leave'}`
    }], { onConflict: 'employee_id, date' });

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

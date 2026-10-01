import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const date = req.query.date || new Date().toISOString().split('T')[0];

  const [{ data: employees }, { data: attendance }, { data: admin }] = await Promise.all([
    supabase.from('employees').select('*').eq('admin_id', session.id).order('name'),
    supabase.from('attendance').select('*').eq('date', date),
    supabase.from('admins').select('standard_hours').eq('id', session.id).single()
  ]);

  const standardHours = Number(admin?.standard_hours || 8);

  const rows = (employees || []).map(emp => {
    const rec = (attendance || []).find(a => a.employee_id === emp.id);
    const totalHours = Number(rec?.total_hours) || 0;
    const ot = Math.max(0, totalHours - standardHours);
    const dailyBase = Number(emp.monthly_salary || 0) / 30;
    const otPay = ot * Number(emp.overtime_rate || 0);
    const status = rec ? rec.status : 'Absent';
    const isLate = status === 'Late';

    return {
      employee_id: emp.id,
      name: emp.name,
      code: emp.emp_code,
      department: emp.department,
      status,
      isLate,
      totalHours,
      ot,
      punches: rec?.punches || [],
      dailyBase: status === 'Absent' ? 0 : dailyBase,
      otPay,
      estDailyPay: (status === 'Absent' ? 0 : dailyBase) + otPay
    };
  });

  const totals = {
    employees: rows.length,
    present: rows.filter(r => r.status === 'Present' || r.status === 'Late').length,
    absent: rows.filter(r => r.status === 'Absent').length,
    late: rows.filter(r => r.isLate).length,
    totalHours: rows.reduce((s, r) => s + r.totalHours, 0),
    totalOt: rows.reduce((s, r) => s + r.ot, 0),
    totalPay: rows.reduce((s, r) => s + r.estDailyPay, 0)
  };

  return res.json({ date, rows, totals });
});

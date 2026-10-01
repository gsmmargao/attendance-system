import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Missing or invalid month (expected YYYY-MM)' });
  }

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const [{ data: employees }, { data: attendance }, { data: admin }] = await Promise.all([
    supabase.from('employees').select('*').eq('admin_id', session.id).order('name'),
    supabase.from('attendance').select('*').gte('date', start).lte('date', end),
    supabase.from('admins').select('standard_hours').eq('id', session.id).single()
  ]);

  const stdHours = Number(admin?.standard_hours || 8);

  const rows = (employees || []).map(emp => {
    const recs = (attendance || []).filter(a => a.employee_id === emp.id);
    const presents = recs.filter(r => ['Present', 'Late'].includes(r.status) || (r.punches?.length > 0)).length;
    const lates = recs.filter(r => r.status === 'Late').length;
    const absents = Math.max(0, daysInMonth - presents);

    let totalHours = 0, otHours = 0;
    recs.forEach(r => {
      const h = Number(r.total_hours) || 0;
      totalHours += h;
      if (h > stdHours) otHours += h - stdHours;
    });

    const monthlySalary = Number(emp.monthly_salary || 0);
    const perDay = monthlySalary / daysInMonth;
    const basePay = perDay * presents;
    const otRate = Number(emp.overtime_rate || 0);
    const otPay = otHours * otRate;

    return {
      employee_id: emp.id,
      name: emp.name,
      code: emp.emp_code,
      department: emp.department,
      presents, absents, lates, totalHours, otHours,
      perDay, basePay, otRate, otPay,
      gross: basePay + otPay
    };
  });

  const totals = {
    employees: rows.length,
    presents: rows.reduce((s, r) => s + r.presents, 0),
    otHours: rows.reduce((s, r) => s + r.otHours, 0),
    payroll: rows.reduce((s, r) => s + r.gross, 0)
  };

  return res.json({ month, daysInMonth, rows, totals });
});

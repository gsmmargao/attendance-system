import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // -------- LIST --------
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('admin_id', session.id)
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ employees: data || [] });
  }

  // -------- CREATE --------
  if (req.method === 'POST') {
    const payload = req.body || {};

    if (!payload.name || !payload.login_id || !payload.password) {
      return res.status(400).json({ error: 'Name, Login ID, and Password are required' });
    }

    // Capacity check
    const { data: admin } = await supabase
      .from('admins')
      .select('employee_limit')
      .eq('id', session.id)
      .single();

    const { count } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('admin_id', session.id);

    if (count >= (admin?.employee_limit || 10)) {
      return res.status(400).json({ error: 'Employee limit reached. Contact developer.' });
    }

    const { data, error } = await supabase
      .from('employees')
      .insert([{ ...payload, admin_id: session.id }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'This Login ID is already taken' });
      }
      return res.status(500).json({ error: error.message });
    }

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Employee Created',
      details: { name: payload.name, code: payload.emp_code }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, employee: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

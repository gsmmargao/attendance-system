import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { hashPassword, isHashed } from '../../lib/password.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing employee id' });

  // ============ EMPLOYEE: only allow updating their OWN face_descriptor ============
  if (session.role === 'employee') {
    if (session.id !== id) {
      return res.status(403).json({ error: 'Employees can only update their own record' });
    }

    if (req.method !== 'PATCH') {
      return res.status(405).json({ error: 'Employees can only PATCH' });
    }

    const body = req.body || {};
    // Whitelist: employees may only set face_descriptor
    if (!('face_descriptor' in body)) {
      return res.status(403).json({ error: 'Employees can only update face_descriptor' });
    }

    const { data, error } = await supabase
      .from('employees')
      .update({ face_descriptor: body.face_descriptor })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, employee: data });
  }

  // ============ ADMIN: full control over employees in their firm ============
  if (session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // -------- UPDATE --------
  if (req.method === 'PATCH') {
    const update = { ...(req.body || {}) };
    if (update.password && !isHashed(update.password)) {
      update.password = await hashPassword(update.password);
    }
    const { data, error } = await supabase
      .from('employees')
      .update(update)
      .eq('id', id)
      .eq('admin_id', session.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Employee Updated',
      details: { emp_id: id, name: data.name }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, employee: data });
  }

  // -------- DELETE --------
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('admin_id', session.id);

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Employee Deleted',
      details: { emp_id: id }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { evaluateAdminSubscription } from '../../lib/subscription.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden — superadmin only' });
  }

  // -------- LIST --------
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const firms = (data || []).map(f => ({
      ...f,
      subscription: evaluateAdminSubscription(f)
    }));
    return res.json({ firms });
  }

  // -------- CREATE --------
  if (req.method === 'POST') {
    const { firm_name, email, password, employee_limit } = req.body || {};
    if (!firm_name || !email || !password) {
      return res.status(400).json({ error: 'firm_name, email, password required' });
    }

    const { data, error } = await supabase
      .from('admins')
      .insert([{
        firm_name,
        email,
        password,
        employee_limit: employee_limit || 10
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      return res.status(500).json({ error: error.message });
    }

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Firm Created by Superadmin',
      details: { firm_id: data.id, firm_name, email }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, firm: data });
  }

  // -------- UPDATE --------
  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing firm id' });

    const allowed = [
      'firm_name', 'email', 'password', 'employee_limit',
      'subscription_status', 'subscription_plan', 'subscription_expires_at'
    ];
    const patch = {};
    for (const k of allowed) {
      if (k in updates) patch[k] = updates[k];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields' });

    const { data, error } = await supabase.from('admins').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Firm Updated by Superadmin',
      details: { firm_id: id, patch }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true, firm: data });
  }

  // -------- DELETE --------
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing firm id' });

    const { error } = await supabase.from('admins').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert([{
      admin_id: session.id,
      action: 'Firm Deleted by Superadmin',
      details: { firm_id: id }
    }]).then(() => {}).catch(() => {});

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

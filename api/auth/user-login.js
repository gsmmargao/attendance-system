import { supabase } from '../../lib/supabase.js';
import { setSessionCookie } from '../../lib/session.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { login_id, password } = req.body || {};
  if (!login_id || !password) return res.status(400).json({ error: 'Missing credentials' });

  const { data: emp, error } = await supabase
    .from('employees')
    .select('*')
    .eq('login_id', login_id)
    .eq('password', password)
    .maybeSingle();

  if (error || !emp) return res.status(401).json({ error: 'Invalid Login ID or Password' });

  setSessionCookie(res, { role: 'employee', id: emp.id, adminId: emp.admin_id });

  const { data: adm } = await supabase
    .from('admins')
    .select('geo_lat, geo_lng, geo_radius')
    .eq('id', emp.admin_id)
    .single();

  return res.json({
    ok: true,
    employee: {
      id: emp.id,
      name: emp.name,
      emp_code: emp.emp_code,
      department: emp.department,
      work_timing: emp.work_timing,
      has_face: !!emp.face_descriptor
    },
    geofence: adm
  });
});

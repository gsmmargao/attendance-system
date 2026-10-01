import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { supabase } from '../../lib/supabase.js';
import { evaluateAdminSubscription } from '../../lib/subscription.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (session.role === 'admin') {
    const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
    if (!admin) return res.status(401).json({ error: 'Admin not found' });
    return res.json({
      role: 'admin',
      admin: {
        id: admin.id,
        firm_name: admin.firm_name,
        email: admin.email,
        employee_limit: admin.employee_limit,
        grace_period_mins: admin.grace_period_mins,
        standard_hours: admin.standard_hours,
        ot_multiplier: admin.ot_multiplier,
        geo_lat: admin.geo_lat,
        geo_lng: admin.geo_lng,
        geo_radius: admin.geo_radius,
        weekly_offs: admin.weekly_offs,
        subscription: evaluateAdminSubscription(admin)
      }
    });
  }

  if (session.role === 'employee') {
    const { data: emp } = await supabase.from('employees').select('*').eq('id', session.id).single();
    if (!emp) return res.status(401).json({ error: 'Employee not found' });
    const { data: adm } = await supabase
      .from('admins').select('geo_lat, geo_lng, geo_radius').eq('id', emp.admin_id).single();
    return res.json({
      role: 'employee',
      employee: {
        id: emp.id,
        name: emp.name,
        emp_code: emp.emp_code,
        department: emp.department,
        work_timing: emp.work_timing,
        face_descriptor: emp.face_descriptor || null,
        has_face: !!emp.face_descriptor
      },
      geofence: adm
    });
  }

  if (session.role === 'superadmin') {
    return res.json({ role: 'superadmin', id: session.id, email: session.email });
  }

  return res.status(400).json({ error: 'Unknown role' });
});

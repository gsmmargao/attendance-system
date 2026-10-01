import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateLate(timing, actualISO, graceMins) {
  if (!timing) return false;
  const shifts = timing.split(',');
  const actual = new Date(actualISO);
  for (const shift of shifts) {
    const [start] = shift.split('-');
    if (!start) continue;
    const [h, m] = start.split(':').map(Number);
    const exp = new Date(actual);
    exp.setHours(h, m, 0, 0);
    const grace = new Date(exp.getTime() + graceMins * 60000);
    return actual > grace;
  }
  return false;
}

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'employee') {
    return res.status(403).json({ error: 'Forbidden — only employees can punch' });
  }

  const { type, lat, lng } = req.body || {};
  if (!['in', 'out'].includes(type)) {
    return res.status(400).json({ error: 'Invalid punch type' });
  }

  const empId = session.id;
  const dateOnly = new Date().toISOString().split('T')[0];

  const { data: emp } = await supabase.from('employees').select('*').eq('id', empId).single();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const { data: adm } = await supabase
    .from('admins')
    .select('geo_lat, geo_lng, geo_radius, grace_period_mins')
    .eq('id', emp.admin_id)
    .single();

  // Geofence check (only if admin configured it)
  if (adm?.geo_lat && adm?.geo_lng && adm?.geo_radius) {
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'Location required for punch' });
    }
    const dist = haversine(Number(lat), Number(lng), Number(adm.geo_lat), Number(adm.geo_lng));
    if (dist > Number(adm.geo_radius)) {
      return res.status(403).json({
        error: `Outside boundary (${Math.round(dist)}m away, allowed ${adm.geo_radius}m)`
      });
    }
  }

  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', empId)
    .eq('date', dateOnly)
    .maybeSingle();

  let punches = existing?.punches || [];
  let totalHours = Number(existing?.total_hours) || 0;
  const now = new Date().toISOString();

  if (type === 'in') {
    if (punches.length && !punches[punches.length - 1].out) {
      return res.status(400).json({ error: 'Already Punched IN — punch OUT first' });
    }
    punches.push({ in: now });

    const isLate = calculateLate(emp.work_timing, now, adm?.grace_period_mins || 15);
    const status = isLate ? 'Late' : 'Present';

    if (!existing) {
      const { error } = await supabase.from('attendance').insert([{
        employee_id: empId,
        date: dateOnly,
        punches,
        total_hours: 0,
        status
      }]);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from('attendance')
        .update({ punches, status }).eq('id', existing.id);
      if (error) return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, type, status, timestamp: now });
  }

  // PUNCH OUT
  if (!punches.length || punches[punches.length - 1].out) {
    return res.status(400).json({ error: 'Not punched IN yet' });
  }
  const last = punches[punches.length - 1];
  last.out = now;
  const sessionHrs = (new Date(last.out) - new Date(last.in)) / 3600000;
  totalHours += sessionHrs;

  const { error } = await supabase.from('attendance')
    .update({ punches, total_hours: totalHours }).eq('id', existing.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, type, timestamp: now, totalHours });
});

import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { employee_id, punch_type, image_base64 } = req.body || {};
  if (!employee_id || !punch_type || !image_base64) {
    return res.status(400).json({ error: 'employee_id, punch_type, image_base64 required' });
  }
  if (!['in', 'out'].includes(punch_type)) {
    return res.status(400).json({ error: 'punch_type must be "in" or "out"' });
  }

  // Auth: employee can only upload for themselves; admin can upload for anyone in their firm
  if (session.role === 'employee' && session.id !== employee_id) {
    return res.status(403).json({ error: 'Employees can only upload their own selfie' });
  }
  if (session.role === 'admin') {
    const { data: emp } = await supabase.from('employees').select('admin_id').eq('id', employee_id).single();
    if (!emp || emp.admin_id !== session.id) {
      return res.status(403).json({ error: 'Employee not in your firm' });
    }
  }

  // Convert base64 → Buffer
  const cleaned = image_base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleaned, 'base64');
  if (buffer.length < 100) return res.status(400).json({ error: 'Invalid image data' });
  if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 5 MB)' });

  const dateOnly = new Date().toISOString().split('T')[0];
  const fileName = `${dateOnly}_${employee_id}_${punch_type}_${Date.now()}.jpg`;

  const { error: upErr } = await supabase
    .storage
    .from('attendance_selfies')
    .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });

  if (upErr) return res.status(500).json({ error: 'Upload failed: ' + upErr.message });

  const { data: pub } = supabase.storage.from('attendance_selfies').getPublicUrl(fileName);

  const { error: dbErr } = await supabase.from('attendance_photos').insert([{
    employee_id,
    punch_type,
    photo_url: pub.publicUrl,
    file_path: fileName
  }]);

  if (dbErr) return res.status(500).json({ error: 'DB insert failed: ' + dbErr.message });

  return res.json({ ok: true, url: pub.publicUrl, file_path: fileName });
});

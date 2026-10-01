import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const routes = {
  // Auth
  'post /api/auth/admin-login':        () => import('./api/auth/admin-login.js'),
  'post /api/auth/admin-logout':       () => import('./api/auth/admin-logout.js'),
  'post /api/auth/user-login':         () => import('./api/auth/user-login.js'),
  'post /api/auth/user-logout':        () => import('./api/auth/user-logout.js'),
  'post /api/auth/superadmin-login':   () => import('./api/auth/superadmin-login.js'),
  'post /api/auth/superadmin-logout':  () => import('./api/auth/superadmin-logout.js'),
  'get /api/auth/me':                  () => import('./api/auth/me.js'),

  // Employees
  'get /api/employees':                () => import('./api/employees/index.js'),
  'post /api/employees':               () => import('./api/employees/index.js'),
  'patch /api/employees/:id':          () => import('./api/employees/[id].js'),
  'delete /api/employees/:id':         () => import('./api/employees/[id].js'),

  // Attendance
  'post /api/attendance/punch':         () => import('./api/attendance/punch.js'),
  'post /api/attendance/upload-selfie': () => import('./api/attendance/upload-selfie.js'),
  'get /api/attendance/photos':         () => import('./api/attendance/photos.js'),
  'get /api/attendance':                () => import('./api/attendance/index.js'),
  'patch /api/attendance/:id':          () => import('./api/attendance/[id].js'),

  // Reports
  'get /api/reports/daily':            () => import('./api/reports/daily.js'),
  'get /api/reports/monthly':          () => import('./api/reports/monthly.js'),

  // Settings
  'get /api/settings':                 () => import('./api/settings/index.js'),
  'patch /api/settings':               () => import('./api/settings/index.js'),

  // Leaves
  'get /api/leaves':                   () => import('./api/leaves/index.js'),
  'post /api/leaves':                  () => import('./api/leaves/index.js'),
  'delete /api/leaves/:id':            () => import('./api/leaves/[id].js'),

  // Holidays
  'get /api/holidays':                 () => import('./api/holidays/index.js'),
  'post /api/holidays':                () => import('./api/holidays/index.js'),
  'delete /api/holidays/:id':          () => import('./api/holidays/[id].js'),

  // Subscription
  'get /api/subscription/status':         () => import('./api/subscription/status.js'),
  'post /api/subscription/create-order':  () => import('./api/subscription/create-order.js'),
  'post /api/subscription/verify':        () => import('./api/subscription/verify.js'),
  'get /api/subscription/expire-check':   () => import('./api/subscription/expire-check.js'),

  // Superadmin
  'get /api/superadmin/firms':            () => import('./api/superadmin/firms.js'),
  'post /api/superadmin/firms':           () => import('./api/superadmin/firms.js'),
  'patch /api/superadmin/firms':          () => import('./api/superadmin/firms.js'),
  'delete /api/superadmin/firms':         () => import('./api/superadmin/firms.js'),
};

for (const [key, loader] of Object.entries(routes)) {
  const [method, routePath] = key.split(' ');
  app[method](routePath, async (req, res) => {
    try {
      // Bridge Express URL params into req.query so handlers can read req.query.id
      for (const [k, v] of Object.entries(req.params || {})) {
        req.query[k] = v;
      }
      const mod = await loader();
      await mod.default(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/api/health', async (req, res) => {
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { error } = await supabase.from('admins').select('id').limit(1);
    res.json({ ok: true, message: 'API running', env: process.env.NODE_ENV, db: error ? 'error: ' + error.message : 'connected' });
  } catch (err) {
    res.json({ ok: false, message: 'DB test failed', error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running → http://localhost:${PORT}`));

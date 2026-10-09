#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🔧 Installing billing system files..."

# ============================================
# 1. lib/billing.js
# ============================================
cat > lib/billing.js << 'EOF'
export const SETUP_FEE_BASE = 2000;
export const GST_PERCENT = 18;
export const PER_EMPLOYEE_MONTHLY = 50;

export function calculateSetupFee() {
  const base = SETUP_FEE_BASE;
  const gst = base * GST_PERCENT / 100;
  return {
    base,
    gst,
    total: base + gst,
    gstPercent: GST_PERCENT
  };
}

export function calculateMonthlyFee(employeeCount) {
  const count = Math.max(0, parseInt(employeeCount) || 0);
  const base = count * PER_EMPLOYEE_MONTHLY;
  const gst = base * GST_PERCENT / 100;
  return {
    base,
    gst,
    total: base + gst,
    gstPercent: GST_PERCENT,
    employeeCount: count,
    ratePerEmployee: PER_EMPLOYEE_MONTHLY
  };
}

export function evaluateBillingState(admin) {
  const now = new Date();

  // 1. Trial window (before setup fee paid)
  const trialStart = admin.trial_started_at ? new Date(admin.trial_started_at) : now;
  const trialEnd = new Date(trialStart.getTime() + 7 * 86400000);

  if (!admin.setup_fee_paid) {
    if (trialEnd > now) {
      const daysLeft = Math.ceil((trialEnd - now) / 86400000);
      return {
        state: 'trial',
        daysLeft,
        blocked: false,
        needsSetupPayment: false,
        setupFee: calculateSetupFee()
      };
    }
    return {
      state: 'setup_required',
      blocked: true,
      blockedReason: 'Setup fee payment required',
      needsSetupPayment: true,
      setupFee: calculateSetupFee()
    };
  }

  // 2. Manually blocked
  if (admin.account_blocked) {
    return {
      state: 'blocked',
      blocked: true,
      blockedReason: admin.blocked_reason || 'Account blocked',
      amountDue: Number(admin.amount_due) || 0,
      dueDate: admin.due_date
    };
  }

  // 3. Monthly billing cycle checks
  if (admin.due_date) {
    const dueDate = new Date(admin.due_date);
    const graceDays = admin.grace_period_days || 5;
    const graceEnd = new Date(dueDate.getTime() + graceDays * 86400000);
    const amountDue = Number(admin.amount_due) || 0;

    // Past grace + money owed → block
    if (now > graceEnd && amountDue > 0) {
      return {
        state: 'overdue',
        blocked: true,
        blockedReason: 'Monthly payment overdue',
        amountDue,
        dueDate: admin.due_date,
        daysOverdue: Math.floor((now - dueDate) / 86400000)
      };
    }

    // In grace window
    if (now > dueDate && amountDue > 0) {
      const daysLeft = Math.ceil((graceEnd - now) / 86400000);
      return {
        state: 'grace',
        blocked: false,
        daysLeft,
        amountDue,
        dueDate: admin.due_date,
        warning: `Payment overdue — ${daysLeft} days before account is blocked`
      };
    }

    // Due soon (< 7 days)
    const daysUntilDue = Math.ceil((dueDate - now) / 86400000);
    if (daysUntilDue <= 7 && amountDue > 0) {
      return {
        state: 'due_soon',
        blocked: false,
        daysUntilDue,
        amountDue,
        dueDate: admin.due_date
      };
    }
  }

  return {
    state: 'active',
    blocked: false,
    nextBillingDate: admin.next_billing_date,
    amountDue: Number(admin.amount_due) || 0
  };
}
EOF
echo "✅ lib/billing.js"

# ============================================
# 2. api/subscription/billing-status.js
# ============================================
cat > api/subscription/billing-status.js << 'EOF'
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { evaluateBillingState } from '../../lib/billing.js';

export default api(async (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const state = evaluateBillingState(admin);

  // Get recent billing history
  const { data: history } = await supabase
    .from('billing_history')
    .select('*')
    .eq('admin_id', session.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return res.json({
    billing: state,
    history: history || []
  });
});
EOF
echo "✅ api/subscription/billing-status.js"

# ============================================
# 3. api/subscription/setup-order.js
# ============================================
cat > api/subscription/setup-order.js << 'EOF'
import Razorpay from 'razorpay';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { calculateSetupFee } from '../../lib/billing.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  if (admin.setup_fee_paid) {
    return res.status(400).json({ error: 'Setup fee already paid' });
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }

  const fee = calculateSetupFee();
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const order = await razorpay.orders.create({
    amount: Math.round(fee.total * 100),
    currency: 'INR',
    receipt: `setup_${session.id}_${Date.now()}`,
    notes: {
      admin_id: session.id,
      payment_type: 'setup',
      base: fee.base,
      gst: fee.gst,
      gst_percent: fee.gstPercent
    }
  });

  // Log pending
  await supabase.from('billing_history').insert([{
    admin_id: session.id,
    payment_type: 'setup',
    base_amount: fee.base,
    gst_amount: fee.gst,
    total_amount: fee.total,
    razorpay_order_id: order.id,
    status: 'pending'
  }]);

  return res.json({
    ok: true,
    order,
    keyId: process.env.RAZORPAY_KEY_ID,
    fee,
    type: 'setup'
  });
});
EOF
echo "✅ api/subscription/setup-order.js"

# ============================================
# 4. api/subscription/monthly-order.js
# ============================================
cat > api/subscription/monthly-order.js << 'EOF'
import Razorpay from 'razorpay';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';
import { calculateMonthlyFee } from '../../lib/billing.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { data: admin } = await supabase.from('admins').select('*').eq('id', session.id).single();
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  if (!admin.setup_fee_paid) {
    return res.status(400).json({ error: 'Please pay setup fee first' });
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }

  // Count current employees
  const { count } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('admin_id', session.id);

  const employeeCount = count || 0;
  if (employeeCount < 1) {
    return res.status(400).json({ error: 'Add at least one employee before monthly payment' });
  }

  const fee = calculateMonthlyFee(employeeCount);
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const order = await razorpay.orders.create({
    amount: Math.round(fee.total * 100),
    currency: 'INR',
    receipt: `monthly_${session.id}_${Date.now()}`,
    notes: {
      admin_id: session.id,
      payment_type: 'monthly',
      employee_count: employeeCount,
      base: fee.base,
      gst: fee.gst
    }
  });

  await supabase.from('billing_history').insert([{
    admin_id: session.id,
    payment_type: 'monthly',
    base_amount: fee.base,
    gst_amount: fee.gst,
    total_amount: fee.total,
    employee_count: employeeCount,
    razorpay_order_id: order.id,
    status: 'pending',
    period_start: admin.due_date || new Date().toISOString().split('T')[0]
  }]);

  return res.json({
    ok: true,
    order,
    keyId: process.env.RAZORPAY_KEY_ID,
    fee,
    type: 'monthly',
    employeeCount
  });
});
EOF
echo "✅ api/subscription/monthly-order.js"

# ============================================
# 5. api/subscription/verify-setup.js
# ============================================
cat > api/subscription/verify-setup.js << 'EOF'
import crypto from 'crypto';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay fields' });
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const now = new Date();
  const nextBilling = new Date(now.getTime() + 30 * 86400000);

  const { error } = await supabase.from('admins').update({
    setup_fee_paid: true,
    setup_fee_paid_at: now.toISOString(),
    subscription_status: 'active',
    subscription_expires_at: nextBilling.toISOString(),
    next_billing_date: nextBilling.toISOString().split('T')[0],
    due_date: nextBilling.toISOString().split('T')[0],
    amount_due: 0,
    account_blocked: false,
    blocked_reason: null,
    last_payment_at: now.toISOString(),
    last_payment_amount: 2360,
    last_payment_type: 'setup'
  }).eq('id', session.id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('billing_history')
    .update({ status: 'paid', razorpay_payment_id })
    .eq('razorpay_order_id', razorpay_order_id);

  await supabase.from('audit_logs').insert([{
    admin_id: session.id,
    action: 'Setup Fee Paid',
    details: { razorpay_order_id, razorpay_payment_id }
  }]).then(() => {}).catch(() => {});

  return res.json({ ok: true, next_billing_date: nextBilling.toISOString().split('T')[0] });
});
EOF
echo "✅ api/subscription/verify-setup.js"

# ============================================
# 6. api/subscription/verify-monthly.js
# ============================================
cat > api/subscription/verify-monthly.js << 'EOF'
import crypto from 'crypto';
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { getSessionFromRequest } from '../../lib/session.js';

export default api(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay fields' });
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const now = new Date();
  const nextBilling = new Date(now.getTime() + 30 * 86400000);

  const { error } = await supabase.from('admins').update({
    subscription_status: 'active',
    subscription_expires_at: nextBilling.toISOString(),
    next_billing_date: nextBilling.toISOString().split('T')[0],
    due_date: nextBilling.toISOString().split('T')[0],
    amount_due: 0,
    account_blocked: false,
    blocked_reason: null,
    last_payment_at: now.toISOString(),
    last_payment_type: 'monthly'
  }).eq('id', session.id);

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('billing_history')
    .update({ status: 'paid', razorpay_payment_id })
    .eq('razorpay_order_id', razorpay_order_id);

  return res.json({ ok: true, next_billing_date: nextBilling.toISOString().split('T')[0] });
});
EOF
echo "✅ api/subscription/verify-monthly.js"

# ============================================
# 7. api/subscription/generate-bill.js (cron: end of month)
# ============================================
cat > api/subscription/generate-bill.js << 'EOF'
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';
import { calculateMonthlyFee } from '../../lib/billing.js';
import { Resend } from 'resend';

export default api(async (req, res) => {
  const cronHeader = req.headers['x-vercel-cron'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cronHeader) return res.status(403).json({ error: 'Cron only' });

  const today = new Date().toISOString().split('T')[0];

  // Find admins whose due_date is today or overdue, with setup paid, not blocked
  const { data: admins } = await supabase
    .from('admins')
    .select('*')
    .eq('setup_fee_paid', true)
    .eq('account_blocked', false)
    .lte('due_date', today);

  const results = [];

  for (const admin of admins || []) {
    const { count } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('admin_id', admin.id);

    const employeeCount = count || 0;
    const fee = calculateMonthlyFee(employeeCount);

    await supabase.from('admins').update({
      amount_due: fee.total,
      employee_count_at_billing: employeeCount
    }).eq('id', admin.id);

    // Send email reminder
    if (admin.email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
          to: admin.email,
          subject: `Monthly Bill — ₹${fee.total.toFixed(0)} due`,
          html: `
            <h2>Monthly Billing</h2>
            <p>Hi ${admin.firm_name},</p>
            <p>Your monthly bill for ${employeeCount} employees:</p>
            <ul>
              <li>Base: ₹${fee.base.toFixed(2)} (${employeeCount} × ₹${fee.ratePerEmployee})</li>
              <li>GST (18%): ₹${fee.gst.toFixed(2)}</li>
              <li><b>Total: ₹${fee.total.toFixed(2)}</b></li>
            </ul>
            <p>Due date: ${admin.due_date}</p>
            <p><a href="${process.env.APP_URL}/admin.html">Pay now</a></p>
          `
        });
      } catch (e) {
        console.error('Email error for', admin.email, e.message);
      }
    }

    results.push({ admin_id: admin.id, amount_due: fee.total, employees: employeeCount });
  }

  return res.json({ ok: true, generated: results.length, results });
});
EOF
echo "✅ api/subscription/generate-bill.js"

# ============================================
# 8. api/subscription/enforce-overdue.js (cron: block past grace)
# ============================================
cat > api/subscription/enforce-overdue.js << 'EOF'
import { supabase } from '../../lib/supabase.js';
import { api } from '../../lib/auth.js';

export default api(async (req, res) => {
  const cronHeader = req.headers['x-vercel-cron'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !cronHeader) return res.status(403).json({ error: 'Cron only' });

  const now = new Date();

  const { data: admins } = await supabase
    .from('admins')
    .select('*')
    .eq('setup_fee_paid', true)
    .eq('account_blocked', false)
    .gt('amount_due', 0);

  const blocked = [];

  for (const admin of admins || []) {
    const grace = admin.grace_period_days || 5;
    const graceEnd = new Date(new Date(admin.due_date).getTime() + grace * 86400000);

    if (now > graceEnd) {
      await supabase.from('admins').update({
        account_blocked: true,
        blocked_reason: `Payment overdue — ₹${Number(admin.amount_due).toFixed(0)} due since ${admin.due_date}`,
        blocked_at: now.toISOString()
      }).eq('id', admin.id);
      blocked.push({ admin_id: admin.id, amount: admin.amount_due });
    }
  }

  return res.json({ ok: true, blockedCount: blocked.length, blocked });
});
EOF
echo "✅ api/subscription/enforce-overdue.js"

# ============================================
# 9. Update vercel.json with crons
# ============================================
cat > vercel.json << 'EOF'
{
  "version": 2,
  "builds": [
    { "src": "server.js", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "server.js" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ],
  "crons": [
    { "path": "/api/subscription/generate-bill", "schedule": "0 2 1 * *" },
    { "path": "/api/subscription/enforce-overdue", "schedule": "0 3 * * *" }
  ]
}
EOF
echo "✅ vercel.json (crons added)"

# ============================================
# 10. Update server.js with new routes
# ============================================
python3 << 'PYEOF'
with open('server.js', 'r') as f:
    html = f.read()

new_routes = """  // Billing
  'get /api/subscription/billing-status':   () => import('./api/subscription/billing-status.js'),
  'post /api/subscription/setup-order':     () => import('./api/subscription/setup-order.js'),
  'post /api/subscription/monthly-order':   () => import('./api/subscription/monthly-order.js'),
  'post /api/subscription/verify-setup':    () => import('./api/subscription/verify-setup.js'),
  'post /api/subscription/verify-monthly':  () => import('./api/subscription/verify-monthly.js'),
  'get /api/subscription/generate-bill':    () => import('./api/subscription/generate-bill.js'),
  'get /api/subscription/enforce-overdue':  () => import('./api/subscription/enforce-overdue.js'),
"""

# Insert before the Superadmin comment
marker = "  // Superadmin"
if marker in html and 'billing-status' not in html:
    html = html.replace(marker, new_routes + "\n" + marker, 1)
    with open('server.js', 'w') as f:
        f.write(html)
    print("✅ server.js routes added")
else:
    print("⏭  Routes already present or marker missing")
PYEOF

echo ""
echo "✅ ============================================"
echo "✅  Billing system files created"
echo "✅ ============================================"
echo ""
echo "Next steps:"
echo "1. Update admin.html subscription modal (run separate script)"
echo "2. Add RESEND_API_KEY to Vercel env vars"
echo "3. Deploy"

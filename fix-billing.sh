#!/bin/bash
cd "$(dirname "$0")"

echo "🔧 Checking admin.html..."

if grep -q "async function paySetup" public/admin.html; then
  echo "⏭  paySetup already exists — nothing to do"
  exit 0
fi

python3 << 'PYEOF'
with open('public/admin.html', 'r') as f:
    html = f.read()

# Find the LAST </script> tag (the one before </body>)
idx = html.rfind('</script>')
if idx == -1:
    print('❌ No </script> tag found')
    exit(1)

# Check if Razorpay script tag is in <head>
if 'checkout.razorpay.com' not in html:
    print('⚠️  Razorpay script tag missing — adding to <head>')
    html = html.replace(
        '</head>',
        '    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>\n</head>',
        1
    )

BILLING_JS = '''
/* ============== BILLING / PAYMENTS ============== */
async function refreshBilling() {
  try {
    const r = await api('/api/subscription/billing-status');
    currentAdmin.billing = r.billing;
    currentAdmin.billing_history = r.history;
    updateBillingBadge();
    if (r.billing.blocked) {
      showBillingBlock(r.billing);
    }
  } catch (e) {
    console.error('Billing refresh failed:', e);
  }
}

function updateBillingBadge() {
  const b = currentAdmin.billing;
  if (!b) return;
  const desktop = document.getElementById('trialBadge');
  const mobile = document.getElementById('trialBadgeMobile');
  let text = '', cls = '';

  if (b.state === 'trial') {
    text = 'Trial • ' + b.daysLeft + 'd left';
    cls = b.daysLeft <= 2 ? 'bg-red-100 text-red-700' : b.daysLeft <= 4 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700';
  } else if (b.state === 'active') {
    text = 'Active';
    cls = 'bg-green-100 text-green-700';
  } else if (b.state === 'due_soon') {
    text = 'Due in ' + b.daysUntilDue + 'd • ₹' + b.amountDue.toFixed(0);
    cls = 'bg-yellow-100 text-yellow-700';
  } else if (b.state === 'grace') {
    text = 'Overdue • ' + b.daysLeft + 'd grace';
    cls = 'bg-red-100 text-red-700';
  } else if (b.state === 'setup_required') {
    text = 'Setup Required';
    cls = 'bg-red-100 text-red-700';
  } else if (b.state === 'overdue' || b.state === 'blocked') {
    text = 'Blocked';
    cls = 'bg-red-100 text-red-700';
  }

  if (desktop) { desktop.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 ' + cls; desktop.innerText = text; desktop.classList.remove('hidden'); }
  if (mobile) { mobile.className = 'text-[10px] font-bold ' + cls + ' px-2 py-0.5 rounded mt-0.5 inline-block'; mobile.innerText = text; mobile.classList.remove('hidden'); }
}

function showBillingBlock(billing) {
  const modal = document.getElementById('subscriptionModal');
  const title = document.getElementById('subModalTitle');
  const sub = document.getElementById('subModalSubtitle');

  if (billing.state === 'setup_required') {
    title.innerText = 'Setup Fee Required';
    sub.innerText = 'Pay the one-time setup fee to activate your account.';
  } else if (billing.state === 'overdue' || billing.state === 'blocked') {
    title.innerText = 'Account Blocked';
    sub.innerText = billing.blockedReason || 'Please complete your payment to continue.';
  }
  modal.classList.remove('hidden');
}

async function paySetup() {
  try {
    const r = await api('/api/subscription/setup-order', { method: 'POST' });
    openRazorpay(r, 'setup');
  } catch (e) {
    alert('Payment failed: ' + e.message);
  }
}

async function payMonthly() {
  try {
    const r = await api('/api/subscription/monthly-order', { method: 'POST' });
    openRazorpay(r, 'monthly');
  } catch (e) {
    alert('Payment failed: ' + e.message);
  }
}

function openRazorpay(orderData, type) {
  if (!window.Razorpay) return alert('Razorpay failed to load');
  const order = orderData.order;
  const keyId = orderData.keyId;
  const fee = orderData.fee;

  const rzp = new window.Razorpay({
    key: keyId,
    amount: order.amount,
    currency: order.currency,
    name: (currentAdmin && currentAdmin.firm_name) || 'Attendance System',
    description: type === 'setup' ? 'Setup Fee' : 'Monthly — ' + fee.employeeCount + ' employees',
    order_id: order.id,
    theme: { color: '#2563eb' },
    handler: async (resp) => {
      const endpoint = type === 'setup' ? '/api/subscription/verify-setup' : '/api/subscription/verify-monthly';
      try {
        await api(endpoint, {
          method: 'POST',
          body: {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature
          }
        });
        alert('Payment successful! Account activated.');
        await refreshBilling();
        location.reload();
      } catch (e) {
        alert('Verification failed: ' + e.message);
      }
    },
    prefill: { email: currentAdmin && currentAdmin.email }
  });
  rzp.open();
}

async function contactEnterprise() {
  const firm = (currentAdmin && currentAdmin.firm_name) || 'My Firm';
  const email = (currentAdmin && currentAdmin.email) || '';
  const subject = encodeURIComponent('Enterprise Plan Inquiry - ' + firm);
  const body = encodeURIComponent(
    'Hi,\\n\\nI am interested in the Enterprise plan.\\n\\n' +
    'Firm: ' + firm + '\\nAdmin ID: ' + email + '\\nEmployees: ' + ((allEmployees && allEmployees.length) || 0) + '\\n\\nThanks.'
  );
  window.location.href = 'mailto:gsmmargao@gmail.com?subject=' + subject + '&body=' + body;
}
/* ============== END BILLING ============== */
'''

# Insert before the last </script>
html = html[:idx] + BILLING_JS + '\n' + html[idx:]

with open('public/admin.html', 'w') as f:
    f.write(html)

print('✅ Billing JS injected before </script>')
PYEOF

echo ""
echo "=== Verify ==="
echo -n "paySetup:        "
grep -c "async function paySetup" public/admin.html
echo -n "refreshBilling:  "
grep -c "async function refreshBilling" public/admin.html
echo -n "Razorpay script: "
grep -c "checkout.razorpay.com" public/admin.html

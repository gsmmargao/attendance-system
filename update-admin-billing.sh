#!/bin/bash
cd "$(dirname "$0")"

python3 << 'PYEOF'
with open('public/admin.html', 'r') as f:
    html = f.read()

# ========== 1. Replace subscription modal with new pricing modal ==========
start = html.find('<div id="subscriptionModal"')
end = html.find('</div>\n\n</div>\n\n<script>')

if start == -1:
    print('❌ Modal not found')
else:
    new_modal = '''<div id="subscriptionModal" class="hidden absolute inset-0 bg-black bg-opacity-75 z-[70] flex items-center justify-center p-3 backdrop-blur-sm">
    <div class="bg-white rounded-2xl shadow-2xl p-5 lg:p-6 w-full max-w-3xl max-h-[94vh] overflow-y-auto">

      <div class="text-center mb-5">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl mx-auto mb-3 shadow-lg"><i class="fas fa-crown"></i></div>
        <h2 id="subModalTitle" class="text-xl lg:text-2xl font-bold text-gray-800">Complete Your Setup</h2>
        <p id="subModalSubtitle" class="text-xs lg:text-sm text-gray-500 mt-1">Pay once to activate your account.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">

        <!-- SETUP FEE (one-time) -->
        <div class="border-2 border-blue-500 rounded-2xl p-4 relative shadow-lg md:col-span-2">
          <span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">One-Time Setup</span>
          <h3 class="font-bold text-gray-800 text-sm mb-3 mt-2">Account Setup Fee</h3>
          <div class="mb-3">
            <span class="text-3xl font-black text-blue-600">₹2,360</span>
            <p class="text-[10px] text-gray-500 mt-1">₹2,000 + 18% GST (₹360)</p>
          </div>
          <ul class="text-[11px] text-gray-600 space-y-1.5 mb-4">
            <li><i class="fas fa-check text-green-500 mr-1"></i> Full dashboard access</li>
            <li><i class="fas fa-check text-green-500 mr-1"></i> AI face scanner + kiosk</li>
            <li><i class="fas fa-check text-green-500 mr-1"></i> Reports & payroll</li>
            <li><i class="fas fa-check text-green-500 mr-1"></i> Unlimited features</li>
          </ul>
          <p class="text-[10px] text-gray-500 mb-3 bg-gray-50 p-2 rounded">After setup, monthly billing is <strong>₹59/employee</strong> (₹50 + 18% GST), billed at month-end.</p>
          <button onclick="paySetup()" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-sm transition active:scale-95">Pay ₹2,360 & Activate</button>
        </div>

        <!-- ENTERPRISE -->
        <div class="border-2 border-gray-200 rounded-2xl p-4 flex flex-col hover:border-purple-400 transition">
          <div class="flex items-center justify-between mb-1">
            <h3 class="font-bold text-gray-800 text-sm">Enterprise</h3>
            <i class="fas fa-building text-purple-500"></i>
          </div>
          <div class="mb-3">
            <span class="text-xl font-black text-gray-800">Custom</span>
            <p class="text-[10px] text-gray-500 mt-0.5">Volume-based pricing</p>
          </div>
          <ul class="text-[11px] text-gray-600 space-y-1.5 mb-4 flex-1">
            <li><i class="fas fa-check text-green-500 mr-1"></i> Custom setup</li>
            <li><i class="fas fa-check text-green-500 mr-1"></i> Multi-branch support</li>
            <li><i class="fas fa-check text-green-500 mr-1"></i> Custom integrations</li>
          </ul>
          <button onclick="contactEnterprise()" class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold text-xs transition active:scale-95">Contact Sales</button>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4 text-center">
        <p class="text-[11px] text-gray-500 mb-2 font-semibold">Questions?</p>
        <a href="mailto:gsmmargao@gmail.com?subject=Attendance%20System%20Setup" class="inline-block bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-semibold border border-blue-200 text-[11px]">
          <i class="fas fa-envelope mr-1"></i> gsmmargao@gmail.com
        </a>
        <button type="button" onclick="logout()" class="mt-3 block mx-auto text-xs text-gray-500 hover:text-red-500 underline">Sign out</button>
      </div>

    </div>
  '''

    # Find correct end
    end_marker = html.find('</div>\n\n</div>\n\n<script>', start)
    if end_marker == -1:
        print('❌ Could not find modal end marker')
    else:
        html = html[:start] + new_modal + html[end_marker:]
        print('✅ Subscription modal replaced with new pricing')

# ========== 2. Add new payment functions ==========
billing_js = '''
// ============== BILLING / PAYMENTS ==============
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
    text = `Trial • ${b.daysLeft}d left`;
    cls = b.daysLeft <= 2 ? 'bg-red-100 text-red-700' : b.daysLeft <= 4 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700';
  } else if (b.state === 'active') {
    text = 'Active';
    cls = 'bg-green-100 text-green-700';
  } else if (b.state === 'due_soon') {
    text = `Due in ${b.daysUntilDue}d • ₹${b.amountDue.toFixed(0)}`;
    cls = 'bg-yellow-100 text-yellow-700';
  } else if (b.state === 'grace') {
    text = `Overdue • ${b.daysLeft}d grace`;
    cls = 'bg-red-100 text-red-700';
  } else if (b.state === 'setup_required') {
    text = 'Setup Required';
    cls = 'bg-red-100 text-red-700';
  } else if (b.state === 'overdue' || b.state === 'blocked') {
    text = 'Blocked';
    cls = 'bg-red-100 text-red-700';
  }

  if (desktop) { desktop.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 ${cls}`; desktop.innerText = text; desktop.classList.remove('hidden'); }
  if (mobile) { mobile.className = `text-[10px] font-bold ${cls} px-2 py-0.5 rounded mt-0.5 inline-block`; mobile.innerText = text; mobile.classList.remove('hidden'); }
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
  } catch (e) { alert('Payment failed: ' + e.message); }
}

async function payMonthly() {
  try {
    const r = await api('/api/subscription/monthly-order', { method: 'POST' });
    openRazorpay(r, 'monthly');
  } catch (e) { alert('Payment failed: ' + e.message); }
}

function openRazorpay(orderData, type) {
  if (!window.Razorpay) return alert('Razorpay failed to load');
  const { order, keyId, fee } = orderData;
  const rzp = new window.Razorpay({
    key: keyId,
    amount: order.amount,
    currency: order.currency,
    name: currentAdmin.firm_name || 'Attendance System',
    description: type === 'setup' ? 'Setup Fee' : `Monthly — ${fee.employeeCount} employees`,
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
      } catch (e) { alert('Verification failed: ' + e.message); }
    },
    prefill: { email: currentAdmin.email }
  });
  rzp.open();
}

async function contactEnterprise() {
  const firm = currentAdmin?.firm_name || 'My Firm';
  const email = currentAdmin?.email || '';
  const subject = encodeURIComponent('Enterprise Plan Inquiry - ' + firm);
  const body = encodeURIComponent(
    'Hi,\\n\\nI am interested in the Enterprise plan.\\n\\n' +
    'Firm: ' + firm + '\\nAdmin ID: ' + email + '\\nEmployees: ' + (allEmployees?.length || 0) + '\\n\\nThanks.'
  );
  window.location.href = 'mailto:gsmmargao@gmail.com?subject=' + subject + '&body=' + body;
}
'''

# Insert before closing </script>
if 'paySetup' not in html:
    html = html.replace('</script>\n</body>', billing_js + '\n</script>\n</body>', 1)
    print('✅ Billing functions added')

# ========== 3. Hook refreshBilling into applyAdminDetails ==========
old = "  // Subscription gate\n  evaluateSubscription();\n  startIdleTimer();\n  loadDashboard();"
new = "  // Billing gate\n  refreshBilling();\n  startIdleTimer();\n  loadDashboard();"
if old in html:
    html = html.replace(old, new, 1)
    print('✅ applyAdminDetails now calls refreshBilling')

with open('public/admin.html', 'w') as f:
    f.write(html)

print('\nDone. Verify with:')
print('  grep -c "paySetup" public/admin.html')
print('  grep -c "refreshBilling" public/admin.html')
PYEOF

echo ""
echo "✅ admin.html updated"

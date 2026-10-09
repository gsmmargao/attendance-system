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

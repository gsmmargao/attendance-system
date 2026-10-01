export const TRIAL_DAYS = 7;

export function evaluateAdminSubscription(admin) {
  const now = new Date();

  if (admin.subscription_status === 'active' && admin.subscription_expires_at) {
    const exp = new Date(admin.subscription_expires_at);
    if (exp > now) {
      const daysLeft = Math.ceil((exp - now) / 86400000);
      return { state: 'active', plan: admin.subscription_plan, daysLeft, expiresAt: admin.subscription_expires_at, blocked: false };
    }
  }

  const trialStart = admin.trial_started_at ? new Date(admin.trial_started_at) : now;
  const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 86400000);
  if (trialEnd > now) {
    const daysLeft = Math.ceil((trialEnd - now) / 86400000);
    return { state: 'trial', daysLeft, expiresAt: trialEnd.toISOString(), blocked: false };
  }

  return {
    state: admin.subscription_status === 'pending_payment' ? 'pending_payment' : 'expired',
    daysLeft: 0,
    blocked: true
  };
}

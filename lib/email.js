import { Resend } from 'resend';

let resend = null;
function client() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME = 'Attendance System';

export async function sendOtpEmail(to, otp, firmName) {
  const subject = `Your verification code: ${otp}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 56px; height: 56px; background: #2563eb; border-radius: 16px; line-height: 56px; color: #fff; font-size: 28px;">🔐</div>
      </div>
      <h2 style="color: #1e293b; margin: 0 0 8px;">Verify your email</h2>
      <p style="color: #64748b; margin: 0 0 20px;">Hi ${firmName}, welcome to Attendance System. Use this code to complete your signup:</p>

      <div style="background: #f1f5f9; padding: 24px; border-radius: 12px; text-align: center; margin: 20px 0;">
        <div style="font-size: 40px; letter-spacing: 10px; font-weight: bold; color: #1e293b; font-family: 'Courier New', monospace;">${otp}</div>
      </div>

      <p style="color: #64748b; font-size: 14px; margin: 20px 0;">This code expires in <strong>10 minutes</strong>.</p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you didn't sign up, please ignore this email.</p>
    </div>
  `;

  // DEV: log OTP to console so you can test without real email
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n📧 [DEV] OTP for ${to}: ${otp}\n`);
  }

  const { data, error } = await client().emails.send({
    from: `${FROM_NAME} <${FROM}>`,
    to,
    subject,
    html
  });

  if (error) throw new Error('Email send failed: ' + error.message);
  return data;
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, BREVO_API_KEY } = process.env;

const smtp = SMTP_HOST
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
  : null;

export const mailConfigured = Boolean(BREVO_API_KEY || smtp);

const subject = (otp) => `StockSense reset code: ${otp}`;
const text = (otp) => `Your StockSense password reset code is ${otp}. It expires in 10 minutes.`;
const html = (otp) => `<div style="font-family:monospace;font-size:16px">
  <p>Your StockSense password reset code:</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p>
  <p>It expires in 10 minutes. If you didn't ask for this, ignore this mail.</p></div>`;

// "Name <email>" or "email" → { name, email }
const parseFrom = (from) => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1] || 'StockSense', email: m[2] } : { name: 'StockSense', email: (from || '').trim() };
};

// Brevo's HTTPS API works on hosts that block outbound SMTP ports (e.g. Render's free plan).
async function sendViaBrevo(to, otp) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: parseFrom(MAIL_FROM || SMTP_USER),
      to: [{ email: to }],
      subject: subject(otp),
      textContent: text(otp),
      htmlContent: html(otp),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Returns true when the mail actually went out; otherwise logs the OTP so the flow still works.
export async function sendOtpMail(to, otp) {
  if (!mailConfigured) {
    console.log(`\n  [otp] ${to} → ${otp}  (set BREVO_API_KEY or SMTP_* to email it)\n`);
    return false;
  }
  try {
    if (BREVO_API_KEY) await sendViaBrevo(to, otp);
    else await smtp.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject: subject(otp), text: text(otp), html: html(otp) });
    console.log(`[otp] emailed reset code to ${to}`);
    return true;
  } catch (err) {
    console.error('[otp] mail failed:', err.message, `→ code for ${to}: ${otp}`);
    return false;
  }
}

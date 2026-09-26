import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

const transport = SMTP_HOST
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  })
  : null;

// Returns true when the mail actually went out; otherwise logs the OTP for local use.
export async function sendOtpMail(to, otp) {
  if (!transport) {
    console.log(`\n  [otp] ${to} → ${otp}  (set SMTP_* in .env to email it)\n`);
    return false;
  }
  try {
    await transport.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject: `StockSense reset code: ${otp}`,
      text: `Your StockSense password reset code is ${otp}. It expires in 10 minutes.`,
      html: `<div style="font-family:monospace;font-size:16px">
        <p>Your StockSense password reset code:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p>
        <p>It expires in 10 minutes. If you didn't ask for this, ignore this mail.</p></div>`,
    });
    return true;
  } catch (err) {
    console.error('[otp] mail failed:', err.message, `→ code for ${to}: ${otp}`);
    return false;
  }
}

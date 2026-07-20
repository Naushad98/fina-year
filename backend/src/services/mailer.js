const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_HOST_USER;
const EMAIL_PASS = process.env.EMAIL_HOST_PASSWORD;
const FROM_EMAIL = process.env.DEFAULT_FROM_EMAIL || 'PayGuard <noreply@fraudshield.com>';

let transporter = null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
  console.log(`[MAILER] SMTP Mailer initialized successfully. Ready to send emails from: ${EMAIL_USER}`);
} else {
  console.log('[MAILER] SMTP Mailer inactive. (No EMAIL_HOST_USER or EMAIL_HOST_PASSWORD in environment, falling back to console prints).');
}

/**
 * Send an email asynchronously.
 * @param {string} to Recipient email address
 * @param {string} subject Email subject line
 * @param {string} text Text body content
 * @param {string} html HTML body content (optional)
 */
const sendMail = async (to, subject, text, html = '') => {
  if (!transporter) {
    console.log(`\n======================================`);
    console.log(`[SMTP FALLBACK] Sending Email:`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text}`);
    console.log(`======================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>')
    });
    console.log(`[MAILER] Email successfully sent to ${to}. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[MAILER ERROR] Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendMail };

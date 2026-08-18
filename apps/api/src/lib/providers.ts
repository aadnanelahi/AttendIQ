import { env } from '../env.js';

export type NotificationChannel = 'EMAIL' | 'WHATSAPP';

export async function sendEmail(opts: { to: string[]; subject: string; body: string; templateCode?: string }): Promise<{ provider: string; status: string; messageId?: string }> {
  if (!env.resendApiKey) {
    console.log(`[email:stub] to=${opts.to.join(',')} subject="${opts.subject}"`);
    return { provider: 'resend', status: 'STUBBED' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'AttendIQ <no-reply@attendiq.local>', to: opts.to, subject: opts.subject, text: opts.body }),
  });
  if (!res.ok) return { provider: 'resend', status: 'FAILED' };
  const json = (await res.json()) as { id?: string };
  return { provider: 'resend', status: 'SENT', messageId: json.id };
}

export async function sendWhatsapp(opts: { to: string[]; body: string }): Promise<{ provider: string; status: string }> {
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    console.log(`[whatsapp:stub] to=${opts.to.join(',')} body="${opts.body.slice(0, 80)}"`);
    return { provider: 'twilio', status: 'STUBBED' };
  }
  // Integration point: Twilio WhatsApp API. Placeholder implementation.
  return { provider: 'twilio', status: 'STUBBED' };
}

export async function dispatch(channel: NotificationChannel, opts: { to: string[]; subject?: string; body: string; templateCode?: string }) {
  return channel === 'EMAIL' ? sendEmail({ to: opts.to, subject: opts.subject ?? 'AttendIQ notification', body: opts.body, templateCode: opts.templateCode }) : sendWhatsapp({ to: opts.to, body: opts.body });
}
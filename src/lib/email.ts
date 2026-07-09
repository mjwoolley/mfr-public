import { Resend } from "resend";

let client: Resend | null = null;

function getClient() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function appUrl(path: string) {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}) {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
    replyTo: opts.replyTo,
  });
  if (error) {
    console.error("Failed to send email:", error);
  }
}

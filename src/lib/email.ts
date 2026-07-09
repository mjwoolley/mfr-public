import { Resend } from "resend";

let client: Resend | null = null;

function getClient() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function appUrl(path: string) {
  // Plain string join, not `new URL(path, base)` — that constructor treats a
  // leading-slash path as absolute and silently drops any path segment
  // already in `base` (relevant now that APP_BASE_URL includes /accounting).
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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

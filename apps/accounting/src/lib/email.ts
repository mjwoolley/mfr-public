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

/**
 * Fold a real recipient into a plus sub-address of the override inbox, so each
 * redirected message keeps the original address visible and arrives as a
 * distinct "user" while still landing in one inbox. The full original address
 * is encoded with the conventional `local+other=domain@inbox` form:
 *   plusAddress("mwoolley2@gmail.com", "dbrown@gmail.com")
 *     => "mwoolley2+dbrown=gmail.com@gmail.com"
 * Assumes the inbox provider supports "+" sub-addressing (Gmail does). Falls
 * back to the bare inbox if either address is malformed.
 */
export function plusAddress(inbox: string, original: string): string {
  const at = inbox.lastIndexOf("@");
  if (at === -1) return inbox;
  const baseLocal = inbox.slice(0, at).split("+")[0]; // drop any existing +tag
  const domain = inbox.slice(at + 1);
  const tag = original
    .trim()
    .toLowerCase()
    .replace(/@/g, "=")
    .replace(/[^a-z0-9._=-]/g, "-");
  return tag ? `${baseLocal}+${tag}@${domain}` : inbox;
}

/**
 * Decide who actually receives a message. Real recipients are only ever used
 * when sending is explicitly enabled — production is the only environment that
 * sets EMAIL_ENABLED=true. Anywhere else (local dev against copied-down prod
 * data), mail is redirected to a plus sub-address of EMAIL_OVERRIDE_TO, or
 * dropped if that is unset, so a real family member can never be emailed from
 * a non-prod environment.
 */
export function resolveRecipient(
  to: string,
):
  | { deliver: true; to: string; redirectedFrom?: string }
  | { deliver: false; reason: string } {
  if (process.env.EMAIL_ENABLED === "true") {
    return { deliver: true, to };
  }
  const override = process.env.EMAIL_OVERRIDE_TO;
  if (override) {
    return { deliver: true, to: plusAddress(override, to), redirectedFrom: to };
  }
  return {
    deliver: false,
    reason: `email disabled (no EMAIL_ENABLED, no EMAIL_OVERRIDE_TO); would have sent to ${to}`,
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}) {
  const routing = resolveRecipient(opts.to);
  if (!routing.deliver) {
    console.warn(`[email] skipped — ${routing.reason}`);
    return;
  }
  const subject = routing.redirectedFrom
    ? `[dev→${routing.redirectedFrom}] ${opts.subject}`
    : opts.subject;

  const resend = getClient();
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    to: routing.to,
    subject,
    react: opts.react,
    replyTo: opts.replyTo,
  });
  if (error) {
    console.error("Failed to send email:", error);
  }
}

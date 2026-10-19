// Pulls just the member's new words out of an email reply: quoted history,
// signatures and mobile footers are dropped. Attachments never reach here
// (only the text body is passed in).

const QUOTE_HEADERS: RegExp[] = [
  /^On .{0,300}wrote:\s*$/i, // Gmail / Apple Mail (may be wrapped onto two lines, see below)
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{10,}\s*$/, // Outlook separator
  /^From:\s.+/i, // Outlook header block
  /^Sent from my \w+/i,
  /^Get Outlook for /i,
]

const SIGNATURE = /^-- ?$/

export const MAX_REPLY_LENGTH = 10_000

/** HTML → text for mail clients that send no text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function extractReplyText(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const kept: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (SIGNATURE.test(line.trimEnd())) break
    if (QUOTE_HEADERS.some((re) => re.test(trimmed))) break
    // "On Mon, … <x@y>\nwrote:" — Gmail wraps long attributions.
    if (/^On\s/i.test(trimmed) && /^wrote:\s*$/i.test((lines[i + 1] ?? '').trim())) break
    if (trimmed.startsWith('>')) continue
    kept.push(line.trimEnd())
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_REPLY_LENGTH)
}

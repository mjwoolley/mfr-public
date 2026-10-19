import { describe, expect, it } from 'vitest'
import { extractReplyText, htmlToText, MAX_REPLY_LENGTH } from './replyText'

describe('extractReplyText', () => {
  it.each([
    ['Gmail', 'New text\n\nOn Mon, Oct 12, 2026 at 9:00 AM MFR <hello@x.org> wrote:\n> old'],
    [
      'wrapped Gmail attribution',
      'New text\n\nOn Mon, Oct 12, 2026 at 9:00 AM MFR <hello@x.org>\nwrote:\n> old',
    ],
    ['Outlook', 'New text\n\n________________________________\nFrom: MFR\nSent: Monday'],
    ['Outlook header block', 'New text\nFrom: MFR <hello@x.org>\nSubject: old'],
    ['original message', 'New text\n-----Original Message-----\nold'],
    ['signature', 'New text\n-- \nAnn Miller'],
    ['mobile footer', 'New text\n\nSent from my iPhone'],
    ['Outlook mobile', 'New text\nGet Outlook for iOS'],
  ])('keeps only the new text (%s)', (_c, body) => {
    expect(extractReplyText(body)).toBe('New text')
  })
  it('drops interleaved quoted lines and collapses blank lines', () => {
    expect(extractReplyText('> old\r\nA\r\n\r\n\r\n\r\nB\r\n> old')).toBe('A\n\nB')
  })
  it('caps very long replies', () => {
    expect(extractReplyText('x'.repeat(MAX_REPLY_LENGTH + 5))).toHaveLength(MAX_REPLY_LENGTH)
  })
})

describe('htmlToText', () => {
  it('strips markup, quoted blocks and entities', () => {
    const html =
      '<html><head><style>p{}</style></head><body><p>Hi &amp; thanks&nbsp;&lt;3 &quot;ok&quot; it&#39;s</p><div>Line<br>two</div><blockquote>old</blockquote></body></html>'
    expect(htmlToText(html).trim()).toBe('Hi & thanks <3 "ok" it\'s\nLine\ntwo')
  })
})

import { describe, expect, it } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { vi } from 'vitest'

vi.mock('@/lib/reservations/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
import {
  isAutomated,
  isFresh,
  isTrustedCertUrl,
  parseReplyEmail,
  parseSnsMessage,
  rawMime,
  senderAuthenticated,
  snsStringToSign,
  verifySnsSignature,
  type SnsMessage,
} from './inbound'

const base: SnsMessage = {
  Type: 'Notification',
  MessageId: 'm1',
  TopicArn: 'arn:aws:sns:us-east-1:1:t',
  Message: 'hello',
  Timestamp: '2026-10-18T12:00:00.000Z',
  SignatureVersion: '1',
  Signature: '',
  SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
}

describe('SNS verification', () => {
  it('builds the canonical string, with Subject only when present', () => {
    expect(snsStringToSign(base)).toBe(
      'Message\nhello\nMessageId\nm1\nTimestamp\n2026-10-18T12:00:00.000Z\nTopicArn\narn:aws:sns:us-east-1:1:t\nType\nNotification\n',
    )
    expect(snsStringToSign({ ...base, Subject: 'S' })).toContain(
      'MessageId\nm1\nSubject\nS\nTimestamp',
    )
  })

  it('verifies SignatureVersion 1 (SHA1) and rejects unknown versions', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const signed = {
      ...base,
      Signature: createSign('RSA-SHA1').update(snsStringToSign(base)).sign(privateKey, 'base64'),
    }
    expect(await verifySnsSignature(signed, async () => pem)).toBe(true)
    expect(await verifySnsSignature({ ...signed, SignatureVersion: '3' }, async () => pem)).toBe(
      false,
    )
    expect(
      await verifySnsSignature(signed, async () => {
        throw new Error('offline')
      }),
    ).toBe(false)
  })

  it.each([
    ['https://sns.eu-west-1.amazonaws.com/x.pem', true],
    ['https://sns.cn-north-1.amazonaws.com.cn/x.pem', true],
    ['http://sns.us-east-1.amazonaws.com/x.pem', false],
    ['https://sns.us-east-1.amazonaws.com.evil.com/x.pem', false],
    ['https://sns.us-east-1.amazonaws.com/x.txt', false],
    ['not a url', false],
  ])('trusts cert URL %s: %s', (url, ok) => {
    expect(isTrustedCertUrl(url)).toBe(ok)
  })

  it('accepts recent messages only', () => {
    const now = Date.parse(base.Timestamp)
    expect(isFresh(base, now + 59 * 60_000)).toBe(true)
    expect(isFresh(base, now + 61 * 60_000)).toBe(false)
    expect(isFresh(base, now - 10 * 60_000)).toBe(false)
    expect(isFresh({ ...base, Timestamp: 'garbage' }, now)).toBe(false)
  })

  it('parses only complete SNS envelopes', () => {
    expect(parseSnsMessage(base)).toEqual(base)
    expect(parseSnsMessage({ ...base, Signature: undefined })).toBeNull()
    expect(parseSnsMessage('x')).toBeNull()
  })
})

describe('SES receipt checks', () => {
  it.each([
    [{ dmarcVerdict: { status: 'PASS' } }, true],
    [{ dmarcVerdict: { status: 'GRAY' }, dkimVerdict: { status: 'PASS' } }, false],
    [{ dmarcVerdict: { status: 'GRAY' }, dkimVerdict: { status: 'FAIL' } }, false],
    [{ dmarcVerdict: { status: 'FAIL' }, dkimVerdict: { status: 'PASS' } }, false],
    [{ dmarcVerdict: { status: 'PASS' }, spamVerdict: { status: 'FAIL' } }, false],
    [{ dmarcVerdict: { status: 'PASS' }, virusVerdict: { status: 'FAIL' } }, false],
    [undefined, false],
  ])('senderAuthenticated(%j) = %s', (receipt, ok) => {
    expect(senderAuthenticated(receipt)).toBe(ok)
  })

  it('passes UTF-8 content through and keeps Base64 content as raw bytes', () => {
    expect(rawMime({ content: 'raw', receipt: { action: { encoding: 'UTF8' } } })).toBe('raw')
    const decoded = rawMime({
      content: Buffer.from('raw').toString('base64'),
      receipt: { action: { encoding: 'BASE64' } },
    })
    expect(Buffer.isBuffer(decoded)).toBe(true)
    expect(decoded?.toString()).toBe('raw')
    expect(rawMime({})).toBeNull()
  })

  it('preserves non-UTF-8 8bit bodies when given raw bytes', async () => {
    const config = { domain: 'reply.example.org', tokenSecret: 's' }
    const to = 'feedback+kan-1-0123456789abcdef0123456789@reply.example.org'
    const mime = Buffer.concat([
      Buffer.from(
        `From: Ann <ann@x.org>\r\nTo: ${to}\r\nContent-Type: text/plain; charset=iso-8859-1\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`,
        'ascii',
      ),
      Buffer.from('caf\xe9', 'latin1'),
    ])
    const parsed = await parseReplyEmail(mime, 'ann@x.org', [], config)
    expect(parsed.text).toBe('café')
    // Decoding the same bytes as UTF-8 before parsing would have lost the "é".
    const garbled = await parseReplyEmail(mime.toString('utf8'), 'ann@x.org', [], config)
    expect(garbled.text).not.toBe('café')
  })

  it.each([
    [[], 'ann@x.org', 'ann@x.org', 'text/plain', false],
    [[], 'ann@x.org', '<>', 'text/plain', true],
    [[], 'ann@x.org', 'ann@x.org', 'multipart/report; report-type=delivery-status', true],
    [[{ key: 'auto-submitted', value: 'no' }], 'ann@x.org', 'ann@x.org', '', false],
    [[{ key: 'x-auto-response-suppress', value: 'All' }], 'ann@x.org', 'ann@x.org', '', true],
    [[{ key: 'precedence', value: 'list' }], 'ann@x.org', 'ann@x.org', '', true],
    [[], 'postmaster@x.org', 'bounce@x.org', '', true],
  ])('isAutomated(%j, %s, %s, %s) = %s', (headers, from, envelope, ct, expected) => {
    expect(isAutomated(headers, from, envelope, ct)).toBe(expected)
  })

  it('falls back to the HTML body and finds the reply address in To', async () => {
    const config = { domain: 'reply.example.org', tokenSecret: 's' }
    const to = 'feedback+kan-1-0123456789abcdef0123456789@reply.example.org'
    const mime =
      `From: Ann <ann@x.org>\r\nTo: ${to}\r\nSubject: Re\r\nContent-Type: text/html\r\n\r\n` +
      '<p>Thanks!</p><blockquote>old</blockquote>'
    const parsed = await parseReplyEmail(mime, 'ann@x.org', [], config)
    expect(parsed).toEqual({
      from: 'ann@x.org',
      replyAddress: to,
      text: 'Thanks!',
      automated: false,
    })
  })
})

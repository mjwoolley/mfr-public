import { describe, expect, it } from 'vitest'
import { parseReplyAddress, replyAddressFor, replyMacMatches } from './replyAddress'

const config = { domain: 'reply.example.org', tokenSecret: 's3cret' }

describe('reply addresses', () => {
  it('round-trips an issue key bound to the member', () => {
    const address = replyAddressFor(config, 'KAN-12', 'Ann@Example.com')
    expect(address).toMatch(/^feedback\+kan-12-[0-9a-f]{26}@reply\.example\.org$/)
    const parsed = parseReplyAddress(config, address.toUpperCase())!
    expect(parsed.issueKey).toBe('KAN-12')
    expect(replyMacMatches(config, 'KAN-12', 'ann@example.com', parsed.mac)).toBe(true)
  })
  it('does not verify for another member, issue or secret', () => {
    const { mac } = parseReplyAddress(config, replyAddressFor(config, 'KAN-12', 'ann@example.com'))!
    expect(replyMacMatches(config, 'KAN-12', 'bob@example.com', mac)).toBe(false)
    expect(replyMacMatches(config, 'KAN-13', 'ann@example.com', mac)).toBe(false)
    expect(
      replyMacMatches({ ...config, tokenSecret: 'other' }, 'KAN-12', 'ann@example.com', mac),
    ).toBe(false)
    expect(replyMacMatches(config, 'KAN-12', 'ann@example.com', 'short')).toBe(false)
  })
  it.each([
    'feedback+kan-12-abc@reply.example.org',
    'feedback+kan-12-0123456789abcdef0123456789@other.example.org',
    'support+kan-12-0123456789abcdef0123456789@reply.example.org',
    'feedback+notakey-0123456789abcdef0123456789@reply.example.org',
    'no-at-sign',
  ])('rejects %s', (address) => {
    expect(parseReplyAddress(config, address)).toBeNull()
  })
})

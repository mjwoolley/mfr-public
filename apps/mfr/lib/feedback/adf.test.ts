import { describe, expect, it } from 'vitest'
import { adfFromText, adfParagraph, adfToText } from './adf'

describe('ADF helpers', () => {
  it('turns blank-line-separated text into paragraphs with hard breaks', () => {
    const doc = adfFromText('one\ntwo\n\nthree')
    expect(doc.content).toHaveLength(2)
    expect(doc.content[0].content).toEqual([
      { type: 'text', text: 'one' },
      { type: 'hardBreak' },
      { type: 'text', text: 'two' },
    ])
  })
  it('can bold a paragraph', () => {
    expect(adfParagraph('Hi', true).content).toEqual([
      { type: 'text', text: 'Hi', marks: [{ type: 'strong' }] },
    ])
  })
  it('round-trips to plain text, including mentions, emoji and links', () => {
    expect(adfToText(adfFromText('one\ntwo\n\nthree'))).toBe('one\ntwo\n\nthree')
    const node = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { text: '@Ann' } },
            { type: 'text', text: ' fixed ' },
            { type: 'emoji', attrs: { shortName: ':tada:' } },
            { type: 'inlineCard', attrs: { url: 'https://x.test' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
            },
          ],
        },
      ],
    }
    expect(adfToText(node)).toBe('@Ann fixed :tada:https://x.test\n\nitem')
  })
  it('returns empty text for nothing', () => {
    expect(adfToText(null)).toBe('')
  })
})

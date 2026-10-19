// Minimal Atlassian Document Format helpers: Jira Cloud's v3 REST API takes
// and returns rich text as ADF JSON. Feedback is plain text in both directions.

export interface AdfNode {
  type: string
  text?: string
  content?: AdfNode[]
  attrs?: Record<string, unknown>
  marks?: { type: string }[]
}

export interface AdfDoc {
  type: 'doc'
  version: 1
  content: AdfNode[]
}

/** One paragraph, with line breaks kept as hard breaks. */
export function adfParagraph(text: string, bold = false): AdfNode {
  const content: AdfNode[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' })
    if (line.length > 0) {
      content.push(
        bold
          ? { type: 'text', text: line, marks: [{ type: 'strong' }] }
          : { type: 'text', text: line },
      )
    }
  })
  return { type: 'paragraph', content }
}

/** Plain text as an ADF document: blank lines separate paragraphs. */
export function adfFromText(text: string): AdfDoc {
  const paragraphs = text.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0)
  return { type: 'doc', version: 1, content: paragraphs.map((p) => adfParagraph(p)) }
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'panel',
  'rule',
  'tableRow',
])

/** Flattens an ADF node (e.g. a Jira comment body) to readable plain text. */
export function adfToText(node: unknown): string {
  const out: string[] = []
  const walk = (n: AdfNode) => {
    if (n.type === 'text' && n.text) out.push(n.text)
    else if (n.type === 'hardBreak') out.push('\n')
    else if (n.type === 'mention') out.push(String(n.attrs?.text ?? ''))
    else if (n.type === 'emoji') out.push(String(n.attrs?.text ?? n.attrs?.shortName ?? ''))
    else if (n.type === 'inlineCard') out.push(String(n.attrs?.url ?? ''))
    for (const child of n.content ?? []) walk(child)
    if (BLOCKS.has(n.type)) out.push('\n\n')
  }
  if (node && typeof node === 'object') walk(node as AdfNode)
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

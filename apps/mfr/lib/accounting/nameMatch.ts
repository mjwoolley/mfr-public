// Suggesting which login belongs to which Shareholder.
//
// Shareholder rows are often *households* ("John and Michele Anderegg"), while
// a login is one person ("Michele Anderegg"). So the rule is containment, not
// equality: every word of the person's name must appear as a whole word in the
// shareholder's name. That matches the household case without matching
// unrelated people, and it is deliberately one-directional — the shareholder
// name may carry extra words, the login name may not.
//
// A suggestion is only ever a suggestion: the admin can link a non-match after
// confirming a warning, which is what makes a strict rule here safe.

/**
 * Lowercase, strip accents, and reduce punctuation to word boundaries.
 *
 * Apostrophes are *removed* rather than turned into spaces, so "O'Brien" and
 * "OBrien" normalize alike instead of leaving a stray "o"; every other
 * separator (hyphens, periods, commas) becomes a space, so "Mary-Jo" and
 * "Mary Jo" agree.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’ʼ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Joining words that carry no identifying signal. Without this, "and" from a
// household name would be a free match for anyone named e.g. "Anders".
const STOP_WORDS = new Set(['and', 'the', 'of', 'or'])

/**
 * The identifying words of a name: normalized, de-stopworded, 2+ characters.
 *
 * Single letters are dropped so a middle initial on one side and not the other
 * ("Michele A Anderegg" vs "Michele Anderegg") doesn't defeat an obvious match.
 * The cost is that a name written entirely as initials ("J R Miller") is
 * reduced to its surname and can suggest a same-surname household — which is
 * why a suggestion is never applied on its own: an admin picks it.
 */
export function nameTokens(value: string | null | undefined): string[] {
  if (!value) return []
  return normalizeName(value)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

/**
 * True when every identifying word of `userName` appears as a whole word in
 * `shareholderName`.
 *
 * Whole word, not substring: "Ann Miller" must not match "Anderegg Miller".
 * Returns false for an empty/unusable name on either side — no name is not a
 * match, it's an absence of evidence.
 */
export function matchesShareholderName(
  userName: string | null | undefined,
  shareholderName: string | null | undefined,
): boolean {
  const userWords = nameTokens(userName)
  const shareholderWords = new Set(nameTokens(shareholderName))
  if (userWords.length === 0 || shareholderWords.size === 0) return false
  return userWords.every((w) => shareholderWords.has(w))
}

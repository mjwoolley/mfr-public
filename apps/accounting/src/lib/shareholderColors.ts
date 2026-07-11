/**
 * Deterministic per-shareholder colors for the Ownership bar and the
 * Contributions dots — Organic-palette hues, assigned by position (largest
 * holder first) and cycled if the family outgrows the list.
 */
const PALETTE = [
  "#c67139", // terracotta
  "#7a8a5e", // sage
  "#b2622d",
  "#aebf92",
  "#a19786",
  "#8c491a",
  "#56633f",
  "#d67f48",
];

export function assignShareholderColors(shareholderIdsInOrder: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  shareholderIdsInOrder.forEach((id, i) => {
    colors[id] = PALETTE[i % PALETTE.length];
  });
  return colors;
}

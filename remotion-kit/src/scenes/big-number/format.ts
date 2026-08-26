// Module-level formatter: constructing Intl.NumberFormat per frame is
// expensive in long renders and may diverge between browser and node.
const FORMATTER = new Intl.NumberFormat("en-US");

/** Formats a number with fixed en-US locale ("12345" → "12,345"). */
export function formatNumber(value: number): string {
  return FORMATTER.format(value);
}

/**
 * Splits a big-number string like "10x", "42%", "R$ 1,234" into the numeric
 * prefix (null when absent) and the remaining suffix — so BigNumber can
 * count-up only the number part deterministically.
 */
export function splitNumericPrefix(
  raw: string
): { numeric: number | null; prefix: string; suffix: string } {
  const match = /^([^0-9]*)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(raw);
  if (!match) {
    return { numeric: null, prefix: "", suffix: raw };
  }
  const [, prefix, digits, suffix] = match;
  const numeric = Number(digits.replace(/,/g, ""));
  if (Number.isNaN(numeric)) {
    return { numeric: null, prefix: "", suffix: raw };
  }
  return { numeric, prefix, suffix };
}

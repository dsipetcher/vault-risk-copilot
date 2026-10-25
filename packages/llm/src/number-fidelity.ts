/**
 * Parse Groq/OpenAI compact currency and match numbers against allowed inputs.
 * Word scales must be tried before letter units so "billion" is not read as "B".
 */

const UNICODE_HYPHENS = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;
const VERSION_TOKEN = /-?\s*[vV]\d+\b/g;
const WORD_OR_LETTER_SCALE =
  /\$?\s*(-?\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion|bn|mn|[kmb])\b/gi;

const SCALE_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  mn: 1_000_000,
  m: 1_000_000,
  million: 1_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
  trillion: 1_000_000_000_000,
};

const LARGE_NUMBER_FLOOR = 1_000;
const RELATIVE_TOLERANCE = 0.02;
const LARGE_SIG_FIGS = 3;
const SMALL_SIG_FIGS = 2;

export type ExtractedNumber = {
  value: number;
  fromPercent: boolean;
};

export function normalizeHyphens(text: string): string {
  return text.replace(UNICODE_HYPHENS, '-');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripVersionTokens(text: string): string {
  return normalizeHyphens(text).replace(VERSION_TOKEN, ' ');
}

export function stripIdentifiers(text: string, identifiers: Iterable<string> = []): string {
  let remaining = normalizeHyphens(text);
  for (const raw of identifiers) {
    const id = normalizeHyphens(raw).trim();
    if (id.length < 2) continue;
    remaining = remaining.replace(new RegExp(escapeRegExp(id), 'gi'), ' ');
  }
  return remaining;
}

export function expandScaledNumbers(text: string): string {
  return stripVersionTokens(text).replace(WORD_OR_LETTER_SCALE, (_match, raw: string, unit: string) => {
    const multiplier = SCALE_MULTIPLIER[unit.toLowerCase()];
    if (!multiplier) return _match;
    return String(Number.parseFloat(raw) * multiplier);
  });
}

/**
 * Pull comparable numbers from model text. Scaled phrases are consumed whole
 * so "$3.5 billion" becomes 3500000000 rather than leftover 3.
 * Version tokens (v3 / -v3 / ‑v3) and known identifiers are removed first.
 */
export function collectExtractedNumbers(
  text: string,
  identifiers: Iterable<string> = []
): ExtractedNumber[] {
  const numbers: ExtractedNumber[] = [];
  let remaining = stripVersionTokens(stripIdentifiers(text, identifiers));

  remaining = remaining.replace(WORD_OR_LETTER_SCALE, (_match, raw: string, unit: string) => {
    const multiplier = SCALE_MULTIPLIER[unit.toLowerCase()];
    if (!multiplier) return _match;
    const value = Number.parseFloat(raw) * multiplier;
    if (Number.isFinite(value)) numbers.push({ value, fromPercent: false });
    return ' ';
  });

  remaining = remaining.replace(/\b\d+\s*d(?:ays?)?\b/gi, ' ');
  remaining = remaining.replace(/\b\d+\s*-\s*d(?:ays?)?\b/gi, ' ');
  remaining = remaining.replace(/\b\d+\s*-\s*hours?\b/gi, ' ');
  remaining = remaining.replace(/\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g, (_, n: string) => n.replace(/,/g, ''));
  remaining = remaining.replace(/\/100\b/g, ' ');
  remaining = remaining.replace(/(\d+(?:\.\d+)?)\s*(?:out of|of)\s*100\b/gi, '$1');
  remaining = remaining.replace(/-?\d+(?:\.\d+)?%/g, (match) => {
    const value = Number.parseFloat(match.slice(0, -1));
    if (!Number.isNaN(value)) numbers.push({ value, fromPercent: true });
    return ' ';
  });

  const rest = remaining.match(/-?\d+(?:\.\d+)?/g) || [];
  for (const raw of rest) {
    const value = Number.parseFloat(raw);
    if (!Number.isNaN(value)) numbers.push({ value, fromPercent: false });
  }
  return numbers;
}

export function collectTextNumbers(text: string, identifiers: Iterable<string> = []): number[] {
  return collectExtractedNumbers(text, identifiers).map((item) => item.value);
}

export function significantFigures(value: number, figs: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (exp - figs + 1);
  return Math.round(value / factor) * factor;
}

export function numbersMatch(
  actual: number,
  allowed: number,
  options: { fromPercent?: boolean } = {}
): boolean {
  if (actual === allowed) return true;

  const actualRounded = Math.round(actual * 100) / 100;
  const allowedRounded = Math.round(allowed * 100) / 100;
  if (actualRounded === allowedRounded) return true;

  const maxAbs = Math.max(Math.abs(actual), Math.abs(allowed));
  const relative = maxAbs === 0 ? 0 : Math.abs(actual - allowed) / maxAbs;
  const fromPercent = options.fromPercent === true;
  const large = maxAbs >= LARGE_NUMBER_FLOOR;

  if ((fromPercent || large) && relative <= RELATIVE_TOLERANCE) return true;
  if (
    (fromPercent || !large) &&
    significantFigures(actual, SMALL_SIG_FIGS) === significantFigures(allowed, SMALL_SIG_FIGS)
  ) {
    return true;
  }
  if (large && significantFigures(actual, LARGE_SIG_FIGS) === significantFigures(allowed, LARGE_SIG_FIGS)) {
    return true;
  }
  return false;
}

export function numberInAllowedSet(
  actual: number,
  allowedNumbers: Iterable<number>,
  options: { fromPercent?: boolean } = {}
): boolean {
  for (const allowed of allowedNumbers) {
    if (numbersMatch(actual, allowed, options)) return true;
  }
  return false;
}

/**
 * Parse Groq/OpenAI compact currency and match numbers against allowed inputs.
 * Word scales must be tried before letter units so "billion" is not read as "B".
 */

const WORD_OR_LETTER_SCALE =
  /\$?\s*(-?\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion|[kmb])\b/gi;

const SCALE_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
  trillion: 1_000_000_000_000,
};

const LARGE_NUMBER_FLOOR = 1_000;
const RELATIVE_TOLERANCE = 0.02;
const SIG_FIGS = 3;

export function expandScaledNumbers(text: string): string {
  return text.replace(WORD_OR_LETTER_SCALE, (_match, raw: string, unit: string) => {
    const multiplier = SCALE_MULTIPLIER[unit.toLowerCase()];
    if (!multiplier) return _match;
    return String(Number.parseFloat(raw) * multiplier);
  });
}

/**
 * Pull comparable numbers from model text. Scaled phrases are consumed whole
 * so "$3.5 billion" becomes 3500000000 rather than leftover 3.
 */
export function collectTextNumbers(text: string): number[] {
  const numbers: number[] = [];
  let remaining = text.replace(WORD_OR_LETTER_SCALE, (_match, raw: string, unit: string) => {
    const multiplier = SCALE_MULTIPLIER[unit.toLowerCase()];
    if (!multiplier) return _match;
    const value = Number.parseFloat(raw) * multiplier;
    if (Number.isFinite(value)) numbers.push(value);
    return ' ';
  });

  remaining = remaining.replace(/\b\d+\s*d(?:ays?)?\b/gi, ' ');
  remaining = remaining.replace(/\b\d+\s*-\s*d(?:ays?)?\b/gi, ' ');
  remaining = remaining.replace(/\b\d+\s*-\s*hours?\b/gi, ' ');
  remaining = remaining.replace(/\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g, (_, n: string) => n.replace(/,/g, ''));
  remaining = remaining.replace(/\/100\b/g, ' ');
  remaining = remaining.replace(/(\d+(?:\.\d+)?)\s*(?:out of|of)\s*100\b/gi, '$1');
  remaining = remaining.replace(/-?\d+(?:\.\d+)?%/g, (match) => ` ${match.slice(0, -1)} `);

  const rest = remaining.match(/-?\d+(?:\.\d+)?/g) || [];
  for (const raw of rest) {
    const value = Number.parseFloat(raw);
    if (!Number.isNaN(value)) numbers.push(value);
  }
  return numbers;
}

export function significantFigures(value: number, figs: number = SIG_FIGS): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (exp - figs + 1);
  return Math.round(value / factor) * factor;
}

export function numbersMatch(actual: number, allowed: number): boolean {
  if (actual === allowed) return true;

  const actualRounded = Math.round(actual * 100) / 100;
  const allowedRounded = Math.round(allowed * 100) / 100;
  if (actualRounded === allowedRounded) return true;

  const maxAbs = Math.max(Math.abs(actual), Math.abs(allowed));
  if (maxAbs < LARGE_NUMBER_FLOOR) return false;

  if (Math.abs(actual - allowed) / maxAbs <= RELATIVE_TOLERANCE) return true;
  return significantFigures(actual) === significantFigures(allowed);
}

export function numberInAllowedSet(actual: number, allowedNumbers: Iterable<number>): boolean {
  for (const allowed of allowedNumbers) {
    if (numbersMatch(actual, allowed)) return true;
  }
  return false;
}

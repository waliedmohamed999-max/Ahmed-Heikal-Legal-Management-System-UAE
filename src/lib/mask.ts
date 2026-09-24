/**
 * Mask personal identifiers in free text before it leaves the office (AI requests).
 * Keeps the last 4 characters so a lawyer can still tell documents apart.
 *  • Emirates ID   784-YYYY-NNNNNNN-C (with or without separators)
 *  • UAE IBAN      AE + 21 digits (spaces allowed)
 *  • Card numbers  13–19 digits (Luhn-valid only, to avoid masking case numbers)
 *  • Passport no.  when labelled ("Passport No: X1234567", "جواز …")
 */
const EID = /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g;
const IBAN = /\bAE\d{2}(?:\s?\d{4}){4}\s?\d{3}\b/gi;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const PASSPORT = /((?:passport|جواز(?:\s+السفر)?)\s*(?:no\.?|number|رقم)?\s*[:#]?\s*)([A-Z0-9]{6,9})\b/gi;

const tail = (s: string) => "•••• " + s.replace(/[\s-]/g, "").slice(-4);

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function maskIdentifiers(text: string): string {
  return text
    .replace(EID, (m) => `[Emirates ID ${tail(m)}]`)
    .replace(IBAN, (m) => `[IBAN ${tail(m)}]`)
    .replace(CARD, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhn(d) ? `[card ${tail(d)}]` : m;
    })
    .replace(PASSPORT, (_m, label: string, no: string) => `${label}[passport ${tail(no)}]`);
}

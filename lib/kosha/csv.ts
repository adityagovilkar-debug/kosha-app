// Minimal CSV parsing + bank-statement field coercion (KOSHA-PLAN.md §9).
// No dependency — a small state-machine parser that handles quoted fields,
// escaped quotes, and commas/newlines inside quotes.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows, take the first non-empty as headers.
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return { headers: nonEmpty[0].map((h) => h.trim()), rows: nonEmpty.slice(1) };
}

export type DateFormat = "dmy" | "mdy" | "ymd";

/** Parse a date cell with a chosen ordering into a YYYY-MM-DD string, or null. */
export function parseDateCell(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO first, regardless of chosen format.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = s.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  let d: string, m: string, y: string;
  if (fmt === "dmy") [d, m, y] = parts;
  else if (fmt === "mdy") [m, d, y] = parts;
  else [y, m, d] = parts;

  if (y.length === 2) y = `20${y}`;
  const dn = parseInt(d, 10);
  const mn = parseInt(m, 10);
  const yn = parseInt(y, 10);
  if (!(yn > 1900 && mn >= 1 && mn <= 12 && dn >= 1 && dn <= 31)) return null;
  return `${yn}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
}

/** Parse an amount cell → integer paise (unsigned). Strips currency symbols, commas, parens (accounting negatives), and Dr/Cr. */
export function parseAmountCell(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹$€£,()\s]/g, "").replace(/(dr|cr)$/i, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

/** Whether an amount cell carries an explicit negative sign or a trailing "Dr". */
export function isNegativeCell(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith("-") || /dr$/i.test(s) || /^\(.*\)$/.test(s);
}

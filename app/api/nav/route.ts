import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AMFI mutual-fund NAV proxy. amfiindia.com serves NAVAll.txt (~2 MB, all
// Indian MF schemes, updated each trading evening) without CORS headers,
// so the browser can't fetch it directly — this route fetches it
// server-side. Next's data cache holds the response for 6 hours
// (`revalidate`), so at most four upstream downloads a day regardless of
// how often clients ask.
//
//   GET /api/nav?q=nifty index     → top matches [{ code, name, nav, date }]
//   GET /api/nav?codes=1234,5678   → quotes { [code]: { name, nav, date } }
//
// Auth required — this shouldn't be an open proxy.

const NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const REVALIDATE_SECONDS = 6 * 60 * 60;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

interface Scheme {
  code: string;
  name: string;
  nav: number; // rupees (decimal — NAVs need 4dp; converted to a price, not an amount)
  date: string; // YYYY-MM-DD
}

/** "10-Jul-2026" → "2026-07-10", or null. */
function parseAmfiDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function parseNavFile(text: string): Scheme[] {
  const schemes: Scheme[] = [];
  for (const line of text.split("\n")) {
    // Data rows: Code;ISIN1;ISIN2;Scheme Name;NAV;Date — anything else
    // (section headers, blanks) has fewer fields.
    const parts = line.split(";");
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    if (!/^\d+$/.test(code)) continue;
    const nav = parseFloat(parts[4]);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    const date = parseAmfiDate(parts[5]);
    if (!date) continue;
    schemes.push({ code, name: parts[3].trim(), nav, date });
  }
  return schemes;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const codes = searchParams.get("codes")?.split(",").map((c) => c.trim()).filter(Boolean);
  if (!q && !codes?.length) return NextResponse.json({ error: "Pass ?q= or ?codes=" }, { status: 400 });

  let text: string;
  try {
    const res = await fetch(NAV_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`AMFI responded ${res.status}`);
    text = await res.text();
  } catch {
    return NextResponse.json({ error: "Couldn't reach AMFI — try again later" }, { status: 502 });
  }

  const schemes = parseNavFile(text);

  if (codes?.length) {
    const wanted = new Set(codes);
    const quotes: Record<string, { name: string; nav: number; date: string }> = {};
    for (const s of schemes) {
      if (wanted.has(s.code)) quotes[s.code] = { name: s.name, nav: s.nav, date: s.date };
    }
    return NextResponse.json({ quotes });
  }

  // Search: every space-separated term must appear in the scheme name.
  const terms = q!.split(/\s+/).filter(Boolean);
  const matches: Scheme[] = [];
  for (const s of schemes) {
    const name = s.name.toLowerCase();
    if (terms.every((t) => name.includes(t))) {
      matches.push(s);
      if (matches.length >= 20) break;
    }
  }
  return NextResponse.json({ matches });
}

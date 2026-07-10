"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, ArrowLeft } from "lucide-react";
import { useAccounts } from "@/lib/kosha/accounts";
import { useCategories } from "@/lib/kosha/categories";
import { useCategoryRules, matchRule } from "@/lib/kosha/rules";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { parseCsv, parseDateCell, parseAmountCell, isNegativeCell, type DateFormat } from "@/lib/kosha/csv";
import { formatMoneySigned } from "@/lib/money";
import { errMessage } from "@/lib/errors";

type Stage = "upload" | "map" | "preview";
type AmountMode = "signed" | "debit_credit";

interface Mapping {
  dateCol: number;
  dateFormat: DateFormat;
  amountMode: AmountMode;
  amountCol: number;
  invertSign: boolean;
  debitCol: number;
  creditCol: number;
  payeeCol: number;
  noteCol: number;
}

interface ParsedRow {
  date: string;
  amount: number; // signed minor units (+in / -out)
  payee: string;
  note: string;
  category_id: string | null; // filled by auto-categorization rules
  dupe: boolean;
  include: boolean;
}

const PRESET_KEY = "kosha-import-presets";

function loadPreset(accountId: string): Mapping | null {
  try {
    const all = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}");
    return all[accountId] ?? null;
  } catch {
    return null;
  }
}
function savePreset(accountId: string, mapping: Mapping) {
  try {
    const all = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "{}");
    all[accountId] = mapping;
    localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  } catch {}
}

const DEFAULT_MAPPING: Mapping = {
  dateCol: 0,
  dateFormat: "dmy",
  amountMode: "signed",
  amountCol: 1,
  invertSign: false,
  debitCol: 1,
  creditCol: 2,
  payeeCol: 2,
  noteCol: -1,
};

export default function ImportPage() {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: categoryRules } = useCategoryRules();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const categoriesById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const [stage, setStage] = useState<Stage>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [accountId, setAccountId] = useState("");
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const activeAccounts = accounts ?? [];

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file.text().then((text) => {
      const { headers: h, rows: r } = parseCsv(text);
      if (h.length === 0) return toast.error("That CSV looks empty.");
      setHeaders(h);
      setRows(r);
      const firstAccount = activeAccounts[0]?.id ?? "";
      setAccountId(firstAccount);
      setMapping(loadPreset(firstAccount) ?? DEFAULT_MAPPING);
      setStage("map");
    });
  }

  function computeRows(): ParsedRow[] {
    const out: ParsedRow[] = [];
    for (const r of rows) {
      const date = parseDateCell(r[mapping.dateCol] ?? "", mapping.dateFormat);
      if (!date) continue;

      let amount: number | null = null;
      if (mapping.amountMode === "signed") {
        const mag = parseAmountCell(r[mapping.amountCol] ?? "");
        if (mag == null) continue;
        let neg = isNegativeCell(r[mapping.amountCol] ?? "");
        if (mapping.invertSign) neg = !neg;
        amount = neg ? -mag : mag;
      } else {
        const debit = parseAmountCell(r[mapping.debitCol] ?? "");
        const credit = parseAmountCell(r[mapping.creditCol] ?? "");
        if (credit && credit > 0) amount = credit;
        else if (debit && debit > 0) amount = -debit;
        else continue;
      }
      if (amount === null || amount === 0) continue;

      const payee = (mapping.payeeCol >= 0 ? r[mapping.payeeCol] : "")?.trim() ?? "";
      out.push({
        date,
        amount,
        payee,
        note: (mapping.noteCol >= 0 ? r[mapping.noteCol] : "")?.trim() ?? "",
        // Auto-categorization only applies to spends — income categories
        // are a different kind and a "Swiggy → Dining" rule shouldn't
        // label a refund from Swiggy as Dining income.
        category_id: amount < 0 && payee ? matchRule(categoryRules ?? [], payee) : null,
        dupe: false,
        include: true,
      });
    }
    return out;
  }

  async function goToPreview() {
    if (!accountId) return toast.error("Pick an account to import into");
    const computed = computeRows();
    if (computed.length === 0) return toast.error("No rows parsed — check the column mapping.");
    savePreset(accountId, mapping);

    // Dedupe against existing transactions in the account across the CSV's range.
    const dates = computed.map((r) => r.date).sort();
    const { data: existing } = await supabaseBrowser()
      .from("kosha_transactions")
      .select("date, amount")
      .eq("account_id", accountId)
      .gte("date", dates[0])
      .lte("date", dates[dates.length - 1]);
    const seen = new Set((existing ?? []).map((e) => `${e.date}|${e.amount}`));

    setParsed(
      computed.map((r) => {
        const dupe = seen.has(`${r.date}|${r.amount}`);
        return { ...r, dupe, include: !dupe };
      }),
    );
    setStage("preview");
  }

  async function doImport() {
    const toImport = parsed.filter((r) => r.include);
    if (toImport.length === 0) return toast.error("Nothing selected to import");
    setImporting(true);
    try {
      const {
        data: { user },
      } = await supabaseBrowser().auth.getUser();
      if (!user) throw new Error("Not signed in");
      const rows = toImport.map((r) => ({
        user_id: user.id,
        account_id: accountId,
        date: r.date,
        amount: r.amount,
        type: r.amount < 0 ? "expense" : "income",
        payee: r.payee || null,
        note: r.note || null,
        category_id: r.category_id,
        status: "cleared",
        tags: [],
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseBrowser().from("kosha_transactions").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      await qc.invalidateQueries();
      toast.success(`Imported ${rows.length} transactions`);
      setStage("upload");
      setParsed([]);
      setRows([]);
    } catch (err) {
      toast.error(errMessage(err, "Import failed"));
    } finally {
      setImporting(false);
    }
  }

  const dupeCount = useMemo(() => parsed.filter((r) => r.dupe).length, [parsed]);
  const includeCount = useMemo(() => parsed.filter((r) => r.include).length, [parsed]);

  const colOptions = headers.map((h, i) => (
    <option key={i} value={i}>
      {h || `Column ${i + 1}`}
    </option>
  ));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Import transactions</h1>

      {stage === "upload" && (
        <div className="card p-8 text-center">
          <Upload className="mx-auto mb-3 h-10 w-10 text-brand-400" />
          <p className="text-lg font-semibold">Import a bank statement CSV</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
            Export your account statement as CSV, then map its columns. Kosha remembers the mapping per account
            and skips duplicates.
          </p>
          <button className="btn-primary mt-4 inline-flex" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Choose CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </div>
      )}

      {stage === "map" && (
        <div className="space-y-4">
          <div className="card p-4">
            <label className="label">Import into account</label>
            <select
              className="select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const preset = loadPreset(e.target.value);
                if (preset) setMapping(preset);
              }}
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="card space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date column</label>
                <select className="select" value={mapping.dateCol} onChange={(e) => setMapping({ ...mapping, dateCol: +e.target.value })}>
                  {colOptions}
                </select>
              </div>
              <div>
                <label className="label">Date format</label>
                <select className="select" value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as DateFormat })}>
                  <option value="dmy">DD/MM/YYYY</option>
                  <option value="mdy">MM/DD/YYYY</option>
                  <option value="ymd">YYYY/MM/DD</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Amount columns</label>
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
                <button
                  type="button"
                  className={`rounded-lg py-2 ${mapping.amountMode === "signed" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
                  onClick={() => setMapping({ ...mapping, amountMode: "signed" })}
                >
                  Single column
                </button>
                <button
                  type="button"
                  className={`rounded-lg py-2 ${mapping.amountMode === "debit_credit" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}
                  onClick={() => setMapping({ ...mapping, amountMode: "debit_credit" })}
                >
                  Debit & Credit
                </button>
              </div>
              {mapping.amountMode === "signed" ? (
                <div className="grid grid-cols-2 gap-3">
                  <select className="select" value={mapping.amountCol} onChange={(e) => setMapping({ ...mapping, amountCol: +e.target.value })}>
                    {colOptions}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={mapping.invertSign} onChange={(e) => setMapping({ ...mapping, invertSign: e.target.checked })} className="h-4 w-4" />
                    Flip sign (debits are positive)
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-text-muted">Debit (out)</p>
                    <select className="select" value={mapping.debitCol} onChange={(e) => setMapping({ ...mapping, debitCol: +e.target.value })}>
                      {colOptions}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-text-muted">Credit (in)</p>
                    <select className="select" value={mapping.creditCol} onChange={(e) => setMapping({ ...mapping, creditCol: +e.target.value })}>
                      {colOptions}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Payee / description</label>
                <select className="select" value={mapping.payeeCol} onChange={(e) => setMapping({ ...mapping, payeeCol: +e.target.value })}>
                  <option value={-1}>— none —</option>
                  {colOptions}
                </select>
              </div>
              <div>
                <label className="label">Note (optional)</label>
                <select className="select" value={mapping.noteCol} onChange={(e) => setMapping({ ...mapping, noteCol: +e.target.value })}>
                  <option value={-1}>— none —</option>
                  {colOptions}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setStage("upload")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button className="btn-primary flex-1" onClick={goToPreview}>
              Preview ({rows.length} rows)
            </button>
          </div>
        </div>
      )}

      {stage === "preview" && (
        <div className="space-y-4">
          <div className="card p-4 text-sm">
            <p>
              <b>{includeCount}</b> to import · <b>{dupeCount}</b> likely duplicate{dupeCount === 1 ? "" : "s"} (unchecked)
            </p>
          </div>
          <div className="card max-h-[55vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-text-muted">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 text-left font-semibold">Date</th>
                  <th className="p-2 text-left font-semibold">Payee</th>
                  <th className="p-2 text-left font-semibold">Category</th>
                  <th className="p-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((r, i) => {
                  const cat = r.category_id ? categoriesById.get(r.category_id) : null;
                  return (
                    <tr key={i} className={`border-t ${r.dupe ? "opacity-50" : ""}`} style={{ borderColor: "var(--border)" }}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => setParsed((prev) => prev.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="p-2">{r.date}</td>
                      <td className="max-w-[140px] truncate p-2">{r.payee || <span className="text-text-muted">—</span>}</td>
                      <td className="max-w-[110px] truncate p-2">
                        {cat ? `${cat.emoji} ${cat.name}` : <span className="text-text-muted">—</span>}
                      </td>
                      <td className={`money p-2 text-right font-semibold ${r.amount < 0 ? "text-expense" : "text-income"}`}>{formatMoneySigned(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setStage("map")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button className="btn-primary flex-1" onClick={doImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${includeCount}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

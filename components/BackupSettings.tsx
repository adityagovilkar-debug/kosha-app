"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Download, Upload, FileSpreadsheet, ChevronRight } from "lucide-react";
import { downloadBackup, restoreBackup, type Backup } from "@/lib/kosha/backup";
import { Modal } from "./Modal";
import { errMessage } from "@/lib/errors";

export function BackupSettings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);

  async function onExport() {
    setBusy(true);
    try {
      await downloadBackup();
      toast.success("Backup downloaded");
    } catch (err) {
      toast.error(errMessage(err, "Export failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      if (!backup?.data) throw new Error("Not a Kosha backup file");
      setPending(backup);
    } catch {
      toast.error("Couldn't read that file as a Kosha backup");
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    try {
      const { inserted } = await restoreBackup(pending);
      await qc.invalidateQueries();
      toast.success(`Restored ${inserted} records`);
      setPending(null);
    } catch (err) {
      toast.error(errMessage(err, "Restore failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-5 w-5 text-brand-400" />
        <h2 className="text-lg font-bold">Backup &amp; restore</h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        Download everything as a single JSON file, or restore from one. Receipt images aren&apos;t included (they
        live in cloud storage). Restore adds the file&apos;s data with fresh IDs — best onto an empty account.
      </p>
      <div className="flex gap-2">
        <button className="btn-outline flex-1" onClick={onExport} disabled={busy}>
          <Download className="h-4 w-4" /> Export
        </button>
        <button className="btn-outline flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" /> Restore
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      </div>

      <Link
        href="/import"
        className="mt-3 flex items-center gap-3 rounded-xl border p-3 text-sm transition hover:bg-surface-2"
        style={{ borderColor: "var(--border)" }}
      >
        <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand-400" />
        <span className="flex-1">
          <span className="font-semibold">Import a bank statement</span>
          <span className="block text-text-muted">Map CSV columns · skips duplicates</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
      </Link>

      <Modal open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            This adds every account, transaction, budget, holding and more from the file into your current
            account. Existing data is left untouched, so restoring onto an account that already has data may
            create duplicates.
          </p>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary flex-1" onClick={confirmRestore} disabled={busy}>
              {busy ? "Restoring…" : "Restore"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

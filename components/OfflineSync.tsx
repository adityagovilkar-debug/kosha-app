"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { flushQueue, queueSize, onQueueChange, isOffline } from "@/lib/kosha/offlineQueue";

// Drains the offline transaction queue whenever connectivity returns (and
// once on load), and shows a small "N queued" pill while anything is
// pending. Renders that pill fixed above the mobile bottom bar.
export function OfflineSync() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const refreshCount = () => queueSize().then(setPending);
    const refreshOnline = () => setOffline(isOffline());

    async function flush() {
      const synced = await flushQueue(async (row) => {
        const { error } = await supabaseBrowser().from("kosha_transactions").insert(row);
        if (error) throw error;
      });
      if (synced > 0) {
        await qc.invalidateQueries();
        toast.success(`Synced ${synced} offline ${synced === 1 ? "entry" : "entries"}`);
      }
      refreshCount();
    }

    refreshCount();
    refreshOnline();
    flush();

    const onOnline = () => {
      refreshOnline();
      flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", refreshOnline);
    const unsub = onQueueChange(refreshCount);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", refreshOnline);
      unsub();
    };
  }, [qc]);

  if (pending === 0 && !offline) return null;

  return (
    <div className="glass fixed inset-x-0 bottom-[76px] z-30 mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted md:bottom-4">
      <CloudOff className="h-3.5 w-3.5" />
      {pending > 0 ? `${pending} to sync${offline ? " · offline" : ""}` : "Offline"}
    </div>
  );
}

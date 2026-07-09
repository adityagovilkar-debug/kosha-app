"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { downscaleImage } from "@/lib/imageResize";
import type { ExtractedReceipt, Receipt } from "./types";

const sb = supabaseBrowser;

async function uid(): Promise<string> {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: ["kosha_receipts", id],
    enabled: !!id,
    queryFn: async (): Promise<Receipt> => {
      const { data, error } = await sb().from("kosha_receipts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Receipt;
    },
  });
}

interface UploadResult {
  receiptId: string;
  extracted: ExtractedReceipt | null;
}

/**
 * Downscales, uploads to the kosha-receipts bucket, creates the receipt
 * row, then calls the server route to run Claude vision extraction. If no
 * Anthropic key is configured the upload still succeeds — the receipt is
 * just attached with ocr_status 'failed' and the caller falls back to
 * manual entry (KOSHA-PLAN.md §8: "camera still works ... fields entered
 * manually").
 */
export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      const user_id = await uid();
      const blob = await downscaleImage(file);
      const path = `${user_id}/${crypto.randomUUID()}.jpg`;

      const { error: uploadError } = await sb().storage.from("kosha-receipts").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: receipt, error: insertError } = await sb()
        .from("kosha_receipts")
        .insert({ user_id, storage_path: path, ocr_status: "pending" })
        .select()
        .single();
      if (insertError) throw insertError;

      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: receipt.id }),
      });
      const body = await res.json();
      // A failed extraction still leaves the upload + receipt row intact,
      // so the caller can show the photo and let the user fill in details.
      return { receiptId: receipt.id, extracted: res.ok ? body.extracted : null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_receipts"] }),
  });
}

export function useReceiptImageUrl(storagePath: string | null) {
  return useQuery({
    queryKey: ["kosha_receipt_url", storagePath],
    enabled: !!storagePath,
    queryFn: async (): Promise<string> => {
      const { data, error } = await sb().storage.from("kosha-receipts").createSignedUrl(storagePath!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000, // signed URL is valid for 60 min
  });
}

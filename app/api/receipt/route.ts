import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/server/crypto";
import type { ExtractedReceipt } from "@/lib/kosha/types";

const EXTRACTION_PROMPT = `You are extracting structured data from a photo of a shopping or dining receipt. Respond with ONLY a single JSON object — no markdown fences, no commentary — matching exactly this shape:

{
  "merchant": string | null,
  "date": string | null,        // YYYY-MM-DD
  "total": number | null,       // grand total paid, in major currency units, e.g. 452.50
  "currency": string | null,    // 3-letter ISO code, e.g. "INR", "EUR" — infer from symbols/context if not printed
  "tax": number | null,         // total tax/GST shown, in major units
  "line_items": [{ "name": string, "qty": number | null, "price": number | null }],
  "confidence": number          // 0 to 1, how confident you are in this extraction
}

If a field can't be determined, use null — never fabricate a value. Respond with the JSON object only.`;

function coerceExtracted(raw: unknown): ExtractedReceipt {
  const r = raw as Record<string, unknown>;
  const toMinor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null);
  const lineItems = Array.isArray(r.line_items)
    ? r.line_items.map((li: Record<string, unknown>) => ({
        name: typeof li?.name === "string" ? li.name : "",
        qty: typeof li?.qty === "number" ? li.qty : null,
        price: toMinor(li?.price),
      }))
    : [];
  return {
    merchant: typeof r.merchant === "string" ? r.merchant : null,
    date: typeof r.date === "string" ? r.date : null,
    total: toMinor(r.total),
    currency: typeof r.currency === "string" ? r.currency.toUpperCase() : null,
    tax: toMinor(r.tax),
    line_items: lineItems,
    confidence: typeof r.confidence === "number" ? r.confidence : null,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { receiptId } = await request.json();
  if (!receiptId) return NextResponse.json({ error: "Missing receiptId" }, { status: 400 });

  const { data: receipt, error: receiptError } = await supabase.from("kosha_receipts").select("*").eq("id", receiptId).single();
  if (receiptError || !receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const { data: settings } = await supabase
    .from("kosha_settings")
    .select("anthropic_api_key_encrypted")
    .eq("id", user.id)
    .maybeSingle();
  if (!settings?.anthropic_api_key_encrypted) {
    const message = "No Anthropic API key set — add one in Settings, or fill in the details by hand.";
    await supabase.from("kosha_receipts").update({ ocr_status: "failed", error: message }).eq("id", receiptId);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const apiKey = decryptSecret(settings.anthropic_api_key_encrypted);

    const { data: imageBlob, error: downloadError } = await supabase.storage.from("kosha-receipts").download(receipt.storage_path);
    if (downloadError || !imageBlob) throw new Error("Couldn't load the uploaded photo");
    const base64 = Buffer.from(await imageBlob.arrayBuffer()).toString("base64");

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("Unexpected response from Claude");

    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const extracted = coerceExtracted(JSON.parse(cleaned));

    await supabase.from("kosha_receipts").update({ ocr_status: "done", extracted }).eq("id", receiptId);
    return NextResponse.json({ extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receipt scan failed";
    await supabase.from("kosha_receipts").update({ ocr_status: "failed", error: message }).eq("id", receiptId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

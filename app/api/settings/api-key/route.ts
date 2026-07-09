import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/server/crypto";

// The plaintext Anthropic key only ever exists in this route's memory —
// it's encrypted before it touches the database and never sent back to
// the client (GET only reports whether a key is set).

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data } = await supabase.from("kosha_settings").select("anthropic_api_key_encrypted").eq("id", user.id).maybeSingle();
  return NextResponse.json({ hasKey: !!data?.anthropic_api_key_encrypted });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { apiKey } = await request.json();
  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-ant-")) {
    return NextResponse.json({ error: "That doesn't look like an Anthropic API key" }, { status: 400 });
  }

  const encrypted = encryptSecret(apiKey);
  const { error } = await supabase
    .from("kosha_settings")
    .upsert({ id: user.id, anthropic_api_key_encrypted: encrypted }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("kosha_settings")
    .upsert({ id: user.id, anthropic_api_key_encrypted: null }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

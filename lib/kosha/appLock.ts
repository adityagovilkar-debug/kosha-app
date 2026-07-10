"use client";

// Optional PIN lock (KOSHA-PLAN.md §9). The PIN is stored only as a salted
// SHA-256 hash in localStorage — never in plaintext. Unlock is per browser
// session (sessionStorage), and an idle timer re-locks after 15 minutes.
// This is a convenience gate on top of Supabase auth, not a second auth
// factor — the data is already protected by owner-only RLS.

const PIN_KEY = "kosha-pin"; // { salt: hex, hash: hex }
const UNLOCKED_KEY = "kosha-unlocked"; // sessionStorage marker
export const IDLE_LOCK_MS = 15 * 60 * 1000;

interface PinRecord {
  salt: string;
  hash: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export function hasPin(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(PIN_KEY);
}

export async function setPin(pin: string): Promise<void> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await hashPin(pin, salt);
  const record: PinRecord = { salt, hash };
  localStorage.setItem(PIN_KEY, JSON.stringify(record));
  markUnlocked(); // setting a PIN leaves you unlocked in this session
  notify();
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY);
  sessionStorage.removeItem(UNLOCKED_KEY);
  notify();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return true;
  try {
    const record = JSON.parse(raw) as PinRecord;
    const hash = await hashPin(pin, record.salt);
    return hash === record.hash;
  } catch {
    return false;
  }
}

export function isUnlockedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(UNLOCKED_KEY) === "1";
}

export function markUnlocked(): void {
  sessionStorage.setItem(UNLOCKED_KEY, "1");
  notify();
}

export function relock(): void {
  sessionStorage.removeItem(UNLOCKED_KEY);
  notify();
}

/** True when a PIN is set and the app is not currently unlocked. */
export function isLocked(): boolean {
  return hasPin() && !isUnlockedThisSession();
}

// Tiny pub/sub so the lock overlay reacts to changes across tabs/components.
const LOCK_EVENT = "kosha-lock-change";
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCK_EVENT));
}
export function onLockChange(cb: () => void): () => void {
  window.addEventListener(LOCK_EVENT, cb);
  window.addEventListener("storage", cb); // cross-tab
  return () => {
    window.removeEventListener(LOCK_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

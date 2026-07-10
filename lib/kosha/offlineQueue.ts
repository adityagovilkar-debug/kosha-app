"use client";

import { get, set } from "idb-keyval";
import type { NewTransaction } from "./types";

// A durable offline write-queue for transaction creates (KOSHA-PLAN.md §9:
// "log expenses offline, sync when online"). Entries persist in IndexedDB
// across reloads and flush when connectivity returns. Only simple creates
// are queued — transfers/splits fall back to online-only.

const QUEUE_KEY = "kosha-tx-queue";
const CHANGE_EVENT = "kosha-queue-change";

export interface QueuedTx {
  id: string; // client-side id for dedupe on flush
  row: NewTransaction & { user_id: string };
  queuedAt: string;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function readAll(): Promise<QueuedTx[]> {
  return (await get<QueuedTx[]>(QUEUE_KEY)) ?? [];
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function enqueueTx(row: NewTransaction & { user_id: string }): Promise<void> {
  const queue = await readAll();
  queue.push({ id: crypto.randomUUID(), row, queuedAt: new Date().toISOString() });
  await set(QUEUE_KEY, queue);
  notify();
}

export async function queueSize(): Promise<number> {
  return (await readAll()).length;
}

/**
 * Flushes the queue by inserting each row via `insert`. Successfully
 * inserted entries are removed; anything that still fails stays queued for
 * the next attempt. Returns how many synced.
 */
export async function flushQueue(insert: (row: QueuedTx["row"]) => Promise<void>): Promise<number> {
  if (isOffline()) return 0;
  let queue = await readAll();
  if (queue.length === 0) return 0;

  const remaining: QueuedTx[] = [];
  let synced = 0;
  for (const item of queue) {
    try {
      await insert(item.row);
      synced++;
    } catch {
      remaining.push(item); // keep for next time
    }
  }
  queue = remaining;
  await set(QUEUE_KEY, queue);
  notify();
  return synced;
}

export function onQueueChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

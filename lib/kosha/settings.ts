"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// =====================================================================
// Anthropic API key (server-backed, encrypted at rest — see
// app/api/settings/api-key/route.ts and lib/server/crypto.ts). The
// client only ever learns whether a key is set, never the key itself.
// =====================================================================

export function useApiKeyStatus() {
  return useQuery({
    queryKey: ["kosha_api_key_status"],
    queryFn: async (): Promise<{ hasKey: boolean }> => {
      const res = await fetch("/api/settings/api-key");
      if (!res.ok) throw new Error("Failed to check API key status");
      return res.json();
    },
  });
}

export function useSaveApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save key");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_api_key_status"] }),
  });
}

export function useClearApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/api-key", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear key");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kosha_api_key_status"] }),
  });
}

// =====================================================================
// Trip mode — a lightweight, device-local default (KOSHA-PLAN.md §5):
// while on, Quick-Add defaults to the trip's currency and tags every new
// transaction. Doesn't need to sync across devices, so it's just
// localStorage rather than a database table.
// =====================================================================

export interface TripMode {
  enabled: boolean;
  currency: string;
  tag: string;
}

const TRIP_MODE_KEY = "kosha-trip-mode";

export function getTripMode(): TripMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRIP_MODE_KEY);
    return raw ? (JSON.parse(raw) as TripMode) : null;
  } catch {
    return null;
  }
}

export function setTripMode(trip: TripMode | null) {
  if (typeof window === "undefined") return;
  if (trip) localStorage.setItem(TRIP_MODE_KEY, JSON.stringify(trip));
  else localStorage.removeItem(TRIP_MODE_KEY);
  window.dispatchEvent(new Event("kosha-trip-mode-change"));
}

/** Reactive read of trip mode, updated whenever setTripMode() is called. */
export function useTripMode(): TripMode | null {
  const [trip, setTrip] = useState<TripMode | null>(() => getTripMode());
  useEffect(() => {
    function onChange() {
      setTrip(getTripMode());
    }
    window.addEventListener("kosha-trip-mode-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("kosha-trip-mode-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return trip;
}

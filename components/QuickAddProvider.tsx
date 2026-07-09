"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Transaction } from "@/lib/kosha/types";

interface QuickAddState {
  isOpen: boolean;
  editing: Transaction | null;
  open: (editing?: Transaction | null) => void;
  close: () => void;
}

const QuickAddContext = createContext<QuickAddState | null>(null);

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const open = useCallback((tx: Transaction | null = null) => {
    setEditing(tx);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setEditing(null);
  }, []);

  const value = useMemo(() => ({ isOpen, editing, open, close }), [isOpen, editing, open, close]);

  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider");
  return ctx;
}

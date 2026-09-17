"use client";

import { useState, type ReactNode } from "react";
import { ModeBrand } from "@/components/mode-badge";

// The dark navigation rail. On narrow screens it collapses behind a toggle.
export function AdminRail({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="admin-rail" data-open={open || undefined}>
      <ModeBrand mode="admin" href="/admin" />
      <button type="button" className="rail-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Menu"}</button>
      {children}
    </aside>
  );
}

import type { ReactNode } from "react";
import { ModeBrand } from "@/components/mode-badge";

// Separate routes with persistent top navigation; no scrolling between sections.
export function AdminRail({ children }: { children: ReactNode }) {
  return <header className="admin-rail"><ModeBrand mode="admin" href="/admin" />{children}</header>;
}

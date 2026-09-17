import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { ModeBrand, type Mode } from "@/components/mode-badge";
import { PendingButton } from "@/components/pending-button";

type Link = { href: string; label: string; current?: boolean };

// Top chrome for the contributor, club, and account pages.
export function AppTopbar({ mode, detail, username, links = [], extra }: { mode: Mode; detail?: string; username: string; links?: Link[]; extra?: ReactNode }) {
  return (
    <header className="topbar">
      <ModeBrand mode={mode} detail={detail} />
      <nav className="admin-navigation" aria-label="Pages">
        {links.map((link) => <a key={link.href} href={link.href} className="nav-button" aria-current={link.current ? "page" : undefined}>{link.label}</a>)}
        {extra}
      </nav>
      <div className="account"><a href="/account" className="nav-button account-link">{username}</a><form action={logoutAction}><PendingButton className="text-button" pendingText="Signing out…">Sign out</PendingButton></form></div>
    </header>
  );
}

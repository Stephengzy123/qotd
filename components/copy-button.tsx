"use client";

import { useEffect, useState } from "react";

export function CopyButton({ value, label = "Copy link", className = "primary" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", value);
    }
  }

  return <button type="button" className={className} onClick={copy} aria-live="polite">{copied ? "Copied ✓" : label}</button>;
}

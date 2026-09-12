"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export function MessagePreview({ title, children }: { title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="send-button" onClick={() => { setOpen(true); dialog.current?.showModal(); }}>Preview</button>
    <dialog ref={dialog} className="message-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)}>
      <div className="message-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="text-button" onClick={() => dialog.current?.close()} aria-label="Close preview">Close ×</button></div>
      {open && children}
    </dialog>
  </>;
}

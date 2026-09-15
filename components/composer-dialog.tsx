"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type ComposerDialogProps = {
  buttonLabel: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

// Opens a full-width overlay holding a server-action form. The form itself is
// rendered by the server page and passed in as children.
export function ComposerDialog({ buttonLabel, title, description, className = "primary", children }: ComposerDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Keep the page behind the overlay from scrolling while it is open.
    document.body.classList.toggle("dialog-open", open);
    return () => document.body.classList.remove("dialog-open");
  }, [open]);

  function close() {
    const form = dialog.current?.querySelector("form");
    const dirty = form && Array.from(form.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("textarea[name=announcement], input[name=eventTitle]")).some((field) => field.value.trim());
    if (dirty && !window.confirm("Discard this announcement?")) return;
    dialog.current?.close();
  }

  return <>
    <button type="button" className={className} onClick={() => { setOpen(true); dialog.current?.showModal(); }}>{buttonLabel}</button>
    <dialog ref={dialog} className="composer-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="composer-dialog-header">
        <div><h2 id={titleId}>{title}</h2>{description && <p className="hint">{description}</p>}</div>
        <button type="button" className="text-button" onClick={close} aria-label="Close">Close ×</button>
      </div>
      {open && children}
    </dialog>
  </>;
}

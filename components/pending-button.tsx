"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type PendingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText: string;
  children: ReactNode;
  confirmMessage?: string;
};

export function PendingButton({ pendingText, children, confirmMessage, disabled, name, value, onClick, ...props }: PendingButtonProps) {
  const { pending, data } = useFormStatus();
  const isActiveAction = !name || value === undefined || data?.get(name) === String(value);
  const showPending = pending && isActiveAction;

  return (
    <button
      {...props}
      name={name}
      value={value}
      disabled={disabled || pending}
      aria-busy={showPending}
      data-pending={showPending || undefined}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {showPending ? pendingText : children}
    </button>
  );
}

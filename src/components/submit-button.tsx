"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel, className = "button" }: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}

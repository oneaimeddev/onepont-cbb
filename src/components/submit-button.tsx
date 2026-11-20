"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel, className = "button", name, value, role }: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
  role?: "menuitem";
}) {
  const { pending } = useFormStatus();
  return (
    <button role={role} className={className} name={name} value={value} disabled={pending} aria-busy={pending}>
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import { setUnsavedClinicalDraft } from "./unsaved";

export function ClinicalDraftWatch({ children }: { children: ReactNode }) {
  useEffect(() => {
    const edited = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("form, .document-editor")) setUnsavedClinicalDraft(true);
    };
    const submitted = (event: Event) => {
      if (event.target instanceof HTMLFormElement) setUnsavedClinicalDraft(false);
    };
    document.addEventListener("input", edited);
    document.addEventListener("change", edited);
    document.addEventListener("submit", submitted, true);
    return () => {
      document.removeEventListener("input", edited);
      document.removeEventListener("change", edited);
      document.removeEventListener("submit", submitted, true);
    };
  }, []);
  return children;
}

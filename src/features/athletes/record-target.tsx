"use client";
import { useEffect } from "react";

// Only elements rendered from the authorized workspace may be opened.
export function RecordTarget({ recordId }: { recordId: string | null }) {
  useEffect(() => {
    const reveal = () => {
      const fragment = location.hash.match(/^#registro-([a-f0-9-]{36})$/i)?.[1];
      const id = recordId ?? fragment;
      if (!id) return;
      const row = document.getElementById(`registro-${id.toLowerCase()}`);
      const details = row?.querySelector("details");
      if (!row || !details) return;
      details.open = true;
      row.scrollIntoView({ block: "start" });
      details.querySelector("summary")?.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(reveal);
    window.addEventListener("hashchange", reveal);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", reveal);
    };
  }, [recordId]);
  return null;
}

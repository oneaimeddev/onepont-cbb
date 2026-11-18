"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { birthParts, saoPauloToday, validateBirth, type BirthField } from "./birth-date";
import "./birth-date.css";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function BirthDateField({ initialValue = "", initialToday, error, onChange }: {
  initialValue?: string;
  initialToday: string;
  error?: string;
  onChange?: () => void;
}) {
  const [parts, setParts] = useState(() => birthParts(initialValue));
  const [today, setToday] = useState(initialToday);
  const root = useRef<HTMLFieldSetElement>(null);
  const id = useId();
  const changed = useRef(false);
  const result = validateBirth(parts, today);
  const message = result.error || error;
  const any = Boolean(parts.day || parts.month || parts.year);
  useLayoutEffect(() => {
    for (const field of ["day", "month", "year"] as const) {
      root.current?.querySelector<HTMLSelectElement>(`[name="birth_${field}"]`)?.setCustomValidity(result.field === field ? result.error ?? "" : "");
    }
    if (changed.current) {
      changed.current = false;
      root.current?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [result.error, result.field, parts]);
  useEffect(() => {
    const refresh = () => setToday(saoPauloToday());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  function change(field: BirthField, value: string) {
    changed.current = true;
    setParts((current) => ({ ...current, [field]: value }));
    setToday(saoPauloToday());
    onChange?.();
  }
  const years = Array.from({ length: Number(today.slice(0, 4)) - 1899 }, (_, index) => String(Number(today.slice(0, 4)) - index));
  return <fieldset ref={root} className="birth-date-field" onFocusCapture={() => setToday(saoPauloToday())}>
    <legend>Data de nascimento <span className="birth-optional">(opcional)</span></legend>
    <input type="hidden" name="birth" value={result.value} />
    <div className="birth-date-grid">
      <label htmlFor={`${id}-day`}>Dia
        <select id={`${id}-day`} name="birth_day" value={parts.day} required={any} aria-invalid={result.field === "day" || undefined} aria-describedby={message ? `${id}-error` : undefined} onChange={(event) => change("day", event.target.value)}>
          <option value="">Dia</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-month`}>Mês
        <select id={`${id}-month`} name="birth_month" value={parts.month} required={any} aria-invalid={result.field === "month" || undefined} aria-describedby={message ? `${id}-error` : undefined} onChange={(event) => change("month", event.target.value)}>
          <option value="">Mês</option>{months.map((month, i) => <option key={month} value={String(i + 1)}>{month}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-year`}>Ano
        <select id={`${id}-year`} name="birth_year" value={parts.year} required={any} aria-invalid={result.field === "year" || undefined} aria-describedby={message ? `${id}-error` : undefined} onChange={(event) => change("year", event.target.value)}>
          <option value="">Ano</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
    </div>
    {any && <button type="button" className="birth-clear" onClick={() => { changed.current = true; setParts(birthParts("")); onChange?.(); }}>Limpar nascimento</button>}
    <p id={`${id}-error`} className="field-error birth-error" aria-live="polite">{message}</p>
  </fieldset>;
}

"use client";

import { ReactNode, useId } from "react";

export function InfoTip({ text, align = "center" }: { text: string; align?: "left" | "center" | "right" }) {
  const id = useId();
  return (
    <span className={`info-tip align-${align}`} tabIndex={0} aria-describedby={id} aria-label="Afficher l’explication">
      <span aria-hidden="true">i</span>
      <span className="info-tip-bubble" id={id} role="tooltip">{text}</span>
    </span>
  );
}

export function FieldTitle({ children, help, align }: { children: ReactNode; help: string; align?: "left" | "center" | "right" }) {
  return <span className="field-title">{children}<InfoTip text={help} align={align} /></span>;
}

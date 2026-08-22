"use client";

import { CSSProperties, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InfoTip({ text, align = "center" }: { text: string; align?: "left" | "center" | "right" }) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const positionBubble = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 9;
    let left = align === "left"
      ? triggerRect.left - 8
      : align === "right"
        ? triggerRect.right - bubbleRect.width + 8
        : triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
    left = Math.min(Math.max(left, viewportPadding), window.innerWidth - bubbleRect.width - viewportPadding);
    const fitsAbove = triggerRect.top >= bubbleRect.height + gap + viewportPadding;
    const top = fitsAbove ? triggerRect.top - bubbleRect.height - gap : triggerRect.bottom + gap;
    setStyle({ left, top: Math.max(viewportPadding, top), visibility: "visible" });
  }, [align]);

  useLayoutEffect(() => {
    if (open) positionBubble();
  }, [open, positionBubble, text]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionBubble);
    window.addEventListener("scroll", positionBubble, true);
    return () => {
      window.removeEventListener("resize", positionBubble);
      window.removeEventListener("scroll", positionBubble, true);
    };
  }, [open, positionBubble]);

  return (
    <span
      ref={triggerRef}
      className={`info-tip align-${align}`}
      role="button"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      aria-label="Show explanation"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          triggerRef.current?.blur();
        }
      }}
    >
      <span aria-hidden="true">i</span>
      {open && typeof document !== "undefined" ? createPortal(
        <span ref={bubbleRef} className="info-tip-bubble" id={id} role="tooltip" style={style}>{text}</span>,
        document.body,
      ) : null}
    </span>
  );
}

export function FieldTitle({ children, help, align }: { children: ReactNode; help: string; align?: "left" | "center" | "right" }) {
  return <span className="field-title">{children}<InfoTip text={help} align={align} /></span>;
}

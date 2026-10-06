"use client";

import { CSSProperties, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InfoTip({ text, align = "center", label = "Explain this choice" }: { text: string; align?: "left" | "center" | "right"; label?: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

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
    setStyle({ left, top: Math.max(viewportPadding, Math.min(top, window.innerHeight - bubbleRect.height - viewportPadding)), visibility: "visible" });
  }, [align]);

  useLayoutEffect(() => {
    if (open) positionBubble();
  }, [open, positionBubble, text]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !bubbleRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", positionBubble);
    window.addEventListener("scroll", positionBubble, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", positionBubble);
      window.removeEventListener("scroll", positionBubble, true);
    };
  }, [open, positionBubble]);

  return (
    <button
      type="button"
      ref={triggerRef}
      className={`info-tip align-${align}`}
      aria-describedby={open ? id : undefined}
      aria-label={label}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); show(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <span aria-hidden="true">i</span>
      {open && typeof document !== "undefined" ? createPortal(
        <span ref={bubbleRef} className="info-tip-bubble" id={id} role="tooltip" style={style} onMouseEnter={show} onMouseLeave={hide}>{text}</span>,
        document.body,
      ) : null}
    </button>
  );
}

export function FieldTitle({ children, help, align }: { children: ReactNode; help: string; align?: "left" | "center" | "right" }) {
  return <span className="field-title">{children}<InfoTip text={help} align={align} label={typeof children === "string" ? `Explain ${children}` : undefined} /></span>;
}

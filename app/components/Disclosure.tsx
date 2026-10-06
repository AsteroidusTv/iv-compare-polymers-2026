"use client";
import { useState, type ReactNode } from 'react';

/** Secondary tools stay discoverable without mounting large charts or tables on first load. */
export function Disclosure({ title, description, children, className = '' }: {title: string; description?: string; children?: ReactNode; className?: string}) {
  const [open, setOpen] = useState(false);
  return <details className={`disclosure ${className}`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{title}</span>{description && <small>{description}</small>}</summary>
    {open && <div className="disclosure-content">{children}</div>}
  </details>;
}

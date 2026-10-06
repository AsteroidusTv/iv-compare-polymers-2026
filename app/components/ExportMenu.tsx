"use client";
import { useState, type ReactNode } from 'react';
import { downloadFigureFile } from '../lib/browser-figure-download';

export function ExportMenu({ children }: { children: ReactNode }) {
  return <details className="export-menu"><summary>Export figure <span aria-hidden="true">↓</span></summary>
    <div className="export-options"><p>SVG stays sharp in a report. PNG is a ready-to-use image. Data and method files keep the result reproducible.</p><div className="export-actions">{children}</div></div>
  </details>;
}

export function CopyCaption({ caption, filename = 'figure.caption.txt' }: { caption: string; filename?: string }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(caption); setMessage('Caption copied'); }
    catch { downloadFigureFile(caption, filename, 'text/plain'); setMessage('Caption saved as text'); }
  }
  return <><button type="button" onClick={() => void copy()}>Copy caption</button>{message && <span role="status" className="copy-status">{message}</span>}</>;
}

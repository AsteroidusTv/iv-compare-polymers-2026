"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useWorkspaceState } from "../lib/use-workspace-state";
import { DEFAULT_FIGURE_PRESENTATION, validFigurePresentation, type FigurePresentation } from "../lib/figure-presentation";

const Context = createContext<{ options: FigurePresentation; update: (patch: Partial<FigurePresentation>) => void }>({ options: DEFAULT_FIGURE_PRESENTATION, update: () => {} });
export function FigurePresentationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useWorkspaceState("figure:publication", DEFAULT_FIGURE_PRESENTATION, validFigurePresentation);
  return <Context.Provider value={{ options, update: patch => setOptions(current => ({ ...current, ...patch })) }}>{children}</Context.Provider>;
}
export function useFigurePresentation() { return useContext(Context).options; }
export function FigurePresentationControls() {
  const { options, update } = useContext(Context);
  return <details className="figure-publication-settings"><summary>Publication settings</summary>
    <p>Text size applies to every export. Legend and ribbon choices apply to ageing trends. Labels never merge curves or change calculations; recorded identities remain in the source manifest.</p>
    <div className="figure-publication-fields">
      <label>Text size<select aria-label="Figure export text size" value={options.textSize} onChange={e => update({ textSize: e.target.value as FigurePresentation["textSize"] })}><option value="readable">Readable · report</option><option value="large">Large · reduced figures</option></select></label>
      <label>Individual-curve legend<select aria-label="Figure export curve identities" value={options.legendMode} onChange={e => update({ legendMode: e.target.value as FigurePresentation["legendMode"] })}><option value="cells">Each cell and lot (recommended)</option><option value="materials">Compact · formulation and lot</option></select></label>
      <label>Legend columns<select aria-label="Figure export legend columns" value={options.legendColumns} onChange={e => update({ legendColumns: e.target.value as FigurePresentation["legendColumns"] })}><option value="auto">Automatic wrapping</option>{[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Ribbon labels<select aria-label="Figure export ribbon labels" value={options.ribbonLabels} onChange={e => update({ ribbonLabels: e.target.value as FigurePresentation["ribbonLabels"] })}><option value="auto">Only when they distinguish devices</option><option value="always">Always show selected ribbon groups</option></select></label>
    </div>
    {options.legendMode === "materials" && <p>Compact legends do not identify each cell’s line style. Choose “Each cell and lot” for individual trajectory comparisons.</p>}
  </details>;
}

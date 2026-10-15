/** Publication preferences change presentation only, never scientific grouping or data. */
export interface FigurePresentation {
  textSize: "readable" | "large";
  legendMode: "cells" | "materials";
  legendColumns: "auto" | "1" | "2" | "3";
  ribbonLabels: "auto" | "always";
}
export const DEFAULT_FIGURE_PRESENTATION: FigurePresentation = {
  textSize: "readable", legendMode: "cells", legendColumns: "auto", ribbonLabels: "auto",
};
export function validFigurePresentation(value: unknown): value is FigurePresentation {
  if (!value || typeof value !== "object") return false;
  const v = value as FigurePresentation;
  return ["readable", "large"].includes(v.textSize) && ["cells", "materials"].includes(v.legendMode)
    && ["auto", "1", "2", "3"].includes(v.legendColumns) && ["auto", "always"].includes(v.ribbonLabels);
}
export function figureFonts(options: FigurePresentation = DEFAULT_FIGURE_PRESENTATION) {
  return options.textSize === "large"
    ? { title: 20, legend: 16, detail: 13, tick: 14, axis: 16 }
    : { title: 18, legend: 13, detail: 12, tick: 12, axis: 14 };
}
/** Conservative width estimate, including unbroken identifiers; no truncation. */
export function wrapFigureText(text: string, width: number, fontSize: number): string[] {
  const capacity = Math.max(8, Math.floor(width / (fontSize * .61)));
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > capacity) { lines.push(line); line = ""; }
    if (word.length > capacity) {
      if (line) { lines.push(line); line = ""; }
      for (let start = 0; start < word.length; start += capacity) lines.push(word.slice(start, start + capacity));
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function publicationLegendColumns(width: number, count: number, options: FigurePresentation) {
  return Math.max(1, Math.min(count || 1, options.legendColumns === "auto"
    ? Math.floor((width - 48) / (options.textSize === "large" ? 360 : 280)) : Number(options.legendColumns)));
}

/** Readability for every export engine. Preserve larger source fonts and all geometry. */
export function applyFigureTypography(svg: SVGSVGElement, options = DEFAULT_FIGURE_PRESENTATION) {
  const fonts = figureFonts(options);
  svg.setAttribute("data-figure-text-size", options.textSize);
  for (const text of svg.querySelectorAll("text")) {
    const role = text.getAttribute("data-figure-font-role") ??
      (text.classList.contains("axis-title") ? "axis" : text.classList.contains("axis-label") ? "tick"
        : text.classList.contains("export-title") ? "title" : text.classList.contains("export-legend") ? "legend" : "detail");
    const original = parseFloat(text.style.fontSize || text.getAttribute("font-size") || "0");
    const minimum = fonts[role as keyof typeof fonts] ?? fonts.detail;
    const size = Math.max(original, minimum);
    text.setAttribute("font-size", String(size));
    text.style.setProperty("font-size", `${size}px`, "important");
  }
}

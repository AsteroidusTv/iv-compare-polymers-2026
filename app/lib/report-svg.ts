const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Muted, print-friendly counterparts of the fixed material-family colours.
// Keep distinct hues and the original dash/marker patterns so an overlay
// remains identifiable when the figure is reproduced in a report.
const REPORT_PALETTE: Record<string, string> = {
  "#d55e00": "#8a4932",
  "#e69f00": "#8a6a28",
  "#0072b2": "#365f80",
  "#cc79a7": "#785a70",
  "#009e73": "#376f5b",
  "#a65300": "#755031",
  "#7f3c8d": "#674771",
  "#595959": "#474747",
};

const REPORT_CSS = `
  text { font-family: "Latin Modern Roman", "TeX Gyre Termes", "Times New Roman", serif !important; fill: #202020 !important; }
  svg > text:first-of-type { font-size: 16px !important; font-weight: 700; }
  .export-title { font-size: 15px !important; font-weight: 700; }
  .export-subtitle { font-size: 10px !important; }
  .export-legend { font-size: 10.5px !important; }
  .axis-label { fill: #353535 !important; font-size: 10px !important; }
  .axis-title { fill: #202020 !important; font-size: 11px !important; font-weight: 600; }
  .grid-line, line[stroke="#ddd"] { stroke: #d7d7d7 !important; stroke-width: 0.7px !important; }
  .axis-line, .tick-line, .zero-axis { stroke: #333 !important; stroke-width: 0.9px !important; }
  .reference-baseline line { stroke: #777 !important; stroke-width: 0.9px !important; }
  .reference-baseline text { fill: #444 !important; }
  g[data-export-series-index] > path[fill="none"] { stroke-width: 2.1px !important; }
`;

export function reportInkColor(color: string): string {
  return REPORT_PALETTE[color.toLowerCase()] ?? color;
}

/** Apply only to a detached export clone; never recolour the interactive chart. */
export function applyReportSvgStyle(svg: SVGSVGElement): void {
  svg.setAttribute("data-export-preset", "latex-report");
  svg.style.background = "white";
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attribute of ["stroke", "fill"] as const) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, reportInkColor(value));
    }
    const inlineStyle = element.getAttribute("style");
    if (inlineStyle) element.setAttribute("style", inlineStyle.replace(/#[0-9a-f]{6}\b/gi, (color) => reportInkColor(color)));
  }
  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = REPORT_CSS;
  svg.appendChild(style);
}

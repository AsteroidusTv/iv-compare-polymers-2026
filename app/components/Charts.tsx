"use client";

import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { describeSeriesSelection, describeTrendExport, pointsThrough, uniqueLegendEntries } from "../lib/chart-export";

export interface TrendPoint {
  x: number;
  y: number;
  min: number;
  max: number;
  intervalLow: number;
  intervalHigh: number;
  intervalLabel: "95% CI" | "IQR" | "single value";
  n: number;
  members: Array<{
    observationId: string;
    sampleUid: string;
    sampleLabel: string;
    sampleReference: string;
    batchNo?: string;
    value: number;
  }>;
  selectedLabel?: string;
}

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  points: TrendPoint[];
  exportDetail?: string;
  exportLabel?: string;
  exportLegendKey?: string;
  linePattern?: string;
}

export interface CurveSeries {
  id: string;
  label: string;
  color: string;
  segments: Array<{
    id: string;
    isPrimary: boolean;
    points: Array<{ x: number; y: number; sourceIndex: number }>;
  }>;
}

type CurrentConvention = "instrument" | "pv";

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const MAX_TREND_ZOOM = 12;
const TREND_CHART_WIDTH = 900;
const TREND_CHART_HEIGHT = 360;
const TREND_CHART_MARGIN = { left: 64, right: 22, top: 24, bottom: 50 };
const CURVE_CHART_WIDTH = 900;
const CURVE_CHART_HEIGHT = 360;
const CURVE_CHART_MARGIN = { left: 64, right: 22, top: 24, bottom: 50 };
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EXPORT_SCALE = 3;
const EXPORT_COLUMNS = 3;
const EXPORT_COLUMN_WIDTH = 280;
const EXPORT_LINE_PATTERNS = ["", "8 5", "2 4", "10 4 2 4", "12 4", "4 3"];
const EXPORT_STYLES = `
  text { font-family: Arial, Helvetica, sans-serif; }
  .export-title { fill: #15233d; font-size: 16px; font-weight: 700; }
  .export-subtitle, .export-legend { fill: #5f6875; font-size: 10px; }
  .grid-line { stroke: #e8e5de; stroke-width: 1; }
  .axis-line { stroke: #9ca3af; stroke-width: 1.2; }
  .tick-line { stroke: #9ca3af; stroke-width: 1; }
  .zero-axis { stroke: #687180; stroke-width: 1.35; }
  .zero-axis.vertical { stroke-width: 1.1; }
  .axis-label { fill: #737b88; font-size: 11px; }
  .axis-title { fill: #5f6875; font-size: 11px; font-weight: 700; }
  .reference-baseline line { stroke: #737b88; stroke-width: 1.2; stroke-dasharray: 7 5; }
  .reference-baseline text { fill: #5f6875; font-size: 9px; font-weight: 700; }
  .landmark-guide { stroke-width: 1; stroke-dasharray: 4 4; opacity: .5; }
  .landmark-point { stroke-width: 1.5; }
  .landmark-label { font-size: 8px; font-weight: 700; paint-order: stroke; stroke: white; stroke-width: 3px; stroke-linejoin: round; }
`;

type ExportSeries = Pick<TrendSeries | CurveSeries, "label" | "color"> & {
  exportDetail?: string;
  exportLabel?: string;
  exportLegendKey?: string;
  exportSelection?: string;
};

function exportFileStem(prefix: string, series: ExportSeries[]): string {
  const labels = uniqueLegendEntries(series).map((item) => item.exportLabel ?? item.label).join("-vs-");
  const slug = `${prefix}-${labels}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (slug || prefix).slice(0, 120);
}

function appendSvgText(parent: SVGElement, text: string, x: number, y: number, className: string) {
  const element = document.createElementNS(SVG_NAMESPACE, "text");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("class", className);
  element.textContent = text;
  parent.appendChild(element);
}

function serialiseChart(
  source: SVGSVGElement,
  title: string,
  subtitle: string,
  series: ExportSeries[],
  width: number,
  height: number,
): { content: string; width: number; height: number } {
  const legendSeries = uniqueLegendEntries(series);
  const legendRows = Math.max(1, Math.ceil(legendSeries.length / EXPORT_COLUMNS));
  const legendRowHeight = legendSeries.some((item) => item.exportSelection) ? 40 : legendSeries.some((item) => item.exportDetail) ? 30 : 20;
  const headerHeight = 54 + legendRows * legendRowHeight;
  const exportHeight = height + headerHeight;
  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("xmlns", SVG_NAMESPACE);
  root.setAttribute("viewBox", `0 0 ${width} ${exportHeight}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(exportHeight));

  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = EXPORT_STYLES;
  root.appendChild(style);

  const background = document.createElementNS(SVG_NAMESPACE, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "white");
  root.appendChild(background);

  appendSvgText(root, title, 24, 24, "export-title");
  appendSvgText(root, subtitle, 24, 42, "export-subtitle");
  const legend = document.createElementNS(SVG_NAMESPACE, "g");
  legend.setAttribute("class", "export-legend");
  legendSeries.forEach((item, index) => {
    const column = index % EXPORT_COLUMNS;
    const row = Math.floor(index / EXPORT_COLUMNS);
    const x = 24 + column * EXPORT_COLUMN_WIDTH;
    const y = 62 + row * legendRowHeight;
    const marker = document.createElementNS(SVG_NAMESPACE, "line");
    marker.setAttribute("x1", String(x));
    marker.setAttribute("x2", String(x + 16));
    marker.setAttribute("y1", String(y - 3));
    marker.setAttribute("y2", String(y - 3));
    marker.setAttribute("stroke", item.color);
    marker.setAttribute("stroke-width", "3");
    const pattern = item.exportLegendKey ? "" : EXPORT_LINE_PATTERNS[index % EXPORT_LINE_PATTERNS.length];
    if (pattern) marker.setAttribute("stroke-dasharray", pattern);
    legend.appendChild(marker);
    appendSvgText(legend, item.exportLabel ?? item.label, x + 22, y, "export-legend");
    if (item.exportDetail) appendSvgText(legend, item.exportDetail.slice(0, 48), x + 22, y + 11, "export-subtitle");
    if (item.exportSelection) appendSvgText(legend, item.exportSelection.slice(0, 48), x + 22, y + 22, "export-subtitle");
  });
  root.appendChild(legend);

  const chart = document.createElementNS(SVG_NAMESPACE, "g");
  chart.setAttribute("transform", `translate(0 ${headerHeight})`);
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("aria-label");
  clone.removeAttribute("role");
  clone.removeAttribute("tabindex");
  clone.querySelectorAll<SVGGElement>("[data-export-series-index]").forEach((group) => {
    const index = Number(group.dataset.exportSeriesIndex ?? 0);
    if (series[index]?.exportLegendKey) {
      group.querySelectorAll<SVGPathElement>("path").forEach((path) => path.removeAttribute("stroke-dasharray"));
      return;
    }
    const pattern = EXPORT_LINE_PATTERNS[index % EXPORT_LINE_PATTERNS.length];
    if (!pattern) return;
    group.querySelectorAll<SVGPathElement>("path").forEach((path) => path.setAttribute("stroke-dasharray", pattern));
  });
  Array.from(clone.childNodes).forEach((child) => chart.appendChild(child));
  root.appendChild(chart);

  return {
    content: new XMLSerializer().serializeToString(root),
    width,
    height: exportHeight,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportSvg(source: SVGSVGElement, title: string, subtitle: string, series: ExportSeries[], fileStem: string, width: number, height: number) {
  const exported = serialiseChart(source, title, subtitle, series, width, height);
  downloadBlob(new Blob([exported.content], { type: "image/svg+xml;charset=utf-8" }), `${fileStem}.svg`);
}

async function exportPng(source: SVGSVGElement, title: string, subtitle: string, series: ExportSeries[], fileStem: string, width: number, height: number) {
  const exported = serialiseChart(source, title, subtitle, series, width, height);
  const sourceUrl = URL.createObjectURL(new Blob([exported.content], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The chart image could not be generated."));
    });
    image.src = sourceUrl;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = exported.width * EXPORT_SCALE;
    canvas.height = exported.height * EXPORT_SCALE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable in this browser.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The PNG file could not be generated.");
    downloadBlob(png, `${fileStem}.png`);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

type TrendViewport = { zoom: number; centreX: number; centreY: number };
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampViewport(viewport: TrendViewport): TrendViewport {
  const halfSpan = 0.5 / viewport.zoom;
  return {
    ...viewport,
    centreX: clamp(viewport.centreX, halfSpan, 1 - halfSpan),
    centreY: clamp(viewport.centreY, halfSpan, 1 - halfSpan),
  };
}

function extent(values: number[], includeZero = false): [number, number] {
  if (!values.length) return [0, 1];
  let min = Math.min(...values);
  const max = Math.max(...values);
  if (includeZero) min = Math.min(0, min);
  if (min === max) {
    const delta = Math.abs(min || 1) * 0.1;
    return [min - delta, max + delta];
  }
  const padding = (max - min) * 0.08;
  return [min - padding, max + padding];
}

function ticks(min: number, max: number, count = 5): number[] {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function tickSequence(min: number, max: number, step: number): number[] {
  const count = Math.floor((max - min) / step + 0.5);
  return Array.from({ length: count + 1 }, (_, index) => min + index * step);
}

function niceStep(value: number, targetTickCount = 6): number {
  const roughStep = Math.max(value, Number.EPSILON) / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function TrendChart({
  series,
  xUnit,
  yUnit,
  reportTitle,
  reportSubtitle,
  reportYAxisLabel,
}: {
  series: TrendSeries[];
  xUnit: string;
  yUnit: string;
  reportTitle?: string;
  reportSubtitle?: string;
  reportYAxisLabel?: string;
}) {
  const [viewport, setViewport] = useState<TrendViewport>({ zoom: 1, centreX: 0.5, centreY: 0.5 });
  const [graphEndInput, setGraphEndInput] = useState<string | null>(null);
  const [manualY, setManualY] = useState<{ min: string; max: string } | null>(null);
  const [showIntervals, setShowIntervals] = useState(true);
  const dragRef = useRef<{ clientX: number; clientY: number; centreX: number; centreY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY === 0) return;

      const rect = svg.getBoundingClientRect();
      const svgX = ((event.clientX - rect.left) / rect.width) * TREND_CHART_WIDTH;
      const svgY = ((event.clientY - rect.top) / rect.height) * TREND_CHART_HEIGHT;
      const plotWidth = TREND_CHART_WIDTH - TREND_CHART_MARGIN.left - TREND_CHART_MARGIN.right;
      const plotHeight = TREND_CHART_HEIGHT - TREND_CHART_MARGIN.top - TREND_CHART_MARGIN.bottom;
      const anchorX = clamp((svgX - TREND_CHART_MARGIN.left) / plotWidth, 0, 1);
      const anchorY = 1 - clamp((svgY - TREND_CHART_MARGIN.top) / plotHeight, 0, 1);

      setViewport((current) => {
        const zoom = clamp(current.zoom * (event.deltaY < 0 ? 1.3 : 1 / 1.3), 1, MAX_TREND_ZOOM);
        const visibleStartX = current.centreX - 0.5 / current.zoom;
        const visibleStartY = current.centreY - 0.5 / current.zoom;
        const anchorDataX = visibleStartX + anchorX / current.zoom;
        const anchorDataY = visibleStartY + anchorY / current.zoom;
        return clampViewport({
          zoom,
          centreX: anchorDataX - (anchorX - 0.5) / zoom,
          centreY: anchorDataY - (anchorY - 0.5) / zoom,
        });
      });
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [series.length]);

  if (!series.length) {
    return <div className="empty-chart"><strong>All curves are hidden</strong><span>Select a legend item to show a series again.</span></div>;
  }
  const sourcePoints = series.flatMap((item) => item.points);
  if (!sourcePoints.length) {
    return <div className="empty-chart"><strong>No comparable points</strong><span>Broaden the filters or choose another condition.</span></div>;
  }
  const sourceTimes = sourcePoints.map((point) => point.x);
  const minimumTime = Math.min(...sourceTimes);
  const maximumTime = Math.max(...sourceTimes);
  const displayedGraphEnd = graphEndInput === null ? String(maximumTime) : graphEndInput;
  const requestedGraphEnd = Number(displayedGraphEnd);
  const graphEnd = displayedGraphEnd.trim() && Number.isFinite(requestedGraphEnd) && requestedGraphEnd >= minimumTime && requestedGraphEnd < maximumTime
    ? requestedGraphEnd
    : null;
  const plottedSeries = series
    .map((item) => ({ ...item, points: pointsThrough(item.points, graphEnd) }))
    .filter((item) => item.points.length);
  const all = plottedSeries.flatMap((item) => item.points);
  const isRetention = yUnit === "% of reference";
  const allTimes = all.map((point) => point.x);
  const allValues = all.flatMap((point) => showIntervals ? [point.y, point.intervalLow, point.intervalHigh] : [point.y]);
  const maximumPlottedTime = Math.max(...allTimes, 0);
  const fullXStep = niceStep(graphEnd ?? maximumPlottedTime);
  const fullXMin = 0;
  const fullXMax = graphEnd ?? Math.max(fullXStep, Math.ceil(maximumPlottedTime / fullXStep) * fullXStep);
  const [paddedYMin, paddedYMax] = extent(isRetention ? [...allValues, 100] : allValues);
  const autoYStep = niceStep(paddedYMax - paddedYMin);
  const manualYValid = manualY !== null && manualY.min.trim() !== "" && manualY.max.trim() !== "" && Number.isFinite(Number(manualY.min)) && Number.isFinite(Number(manualY.max)) && Number(manualY.min) < Number(manualY.max);
  const fullYMin = manualYValid ? Number(manualY!.min) : Math.floor(paddedYMin / autoYStep) * autoYStep;
  const fullYMax = manualYValid ? Number(manualY!.max) : Math.ceil(paddedYMax / autoYStep) * autoYStep;
  const width = TREND_CHART_WIDTH;
  const height = TREND_CHART_HEIGHT;
  const margin = TREND_CHART_MARGIN;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xSpan = (fullXMax - fullXMin) / viewport.zoom;
  const ySpan = (fullYMax - fullYMin) / viewport.zoom;
  const xMin = fullXMin + (viewport.centreX - 0.5 / viewport.zoom) * (fullXMax - fullXMin);
  const xMax = xMin + xSpan;
  const yMin = fullYMin + (viewport.centreY - 0.5 / viewport.zoom) * (fullYMax - fullYMin);
  const yMax = yMin + ySpan;
  const sx = (value: number) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * (width - margin.left - margin.right);
  const sy = (value: number) => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xTicks = viewport.zoom === 1 ? (graphEnd === null ? tickSequence(fullXMin, fullXMax, fullXStep) : ticks(fullXMin, fullXMax)) : ticks(xMin, xMax);
  const yTicks = viewport.zoom === 1 && !manualYValid ? tickSequence(fullYMin, fullYMax, autoYStep) : ticks(yMin, yMax);
  const clippedY = allValues.some((value) => value < yMin || value > yMax);
  const exportSummary = describeTrendExport(all, reportSubtitle);
  const exportSeries = plottedSeries.map((item) => ({
    ...item,
    exportSelection: describeSeriesSelection(item.points, exportSummary.mode),
  }));
  const exportTitle = reportTitle ?? `Performance over time — ${yUnit}`;
  const graphEndNote = graphEnd === null ? null : `shown through ${numberFormat.format(graphEnd)} ${xUnit} · observed points only`;
  const scaleNote = `${manualYValid ? "Manual" : "Auto"} Y: ${numberFormat.format(yMin)}–${numberFormat.format(yMax)} ${yUnit}${clippedY ? " · values or intervals clipped" : ""}${showIntervals ? "" : " · uncertainty intervals hidden"}`;
  const exportSubtitle = [exportSummary.subtitle, graphEndNote, scaleNote].filter(Boolean).join(" · ");
  const yAxisLabel = reportYAxisLabel ?? yUnit;
  const exportStem = exportFileStem(graphEnd === null ? "performance-over-time" : `performance-over-time-through-${graphEnd}-${xUnit}`, exportSeries);

  const changeZoom = (nextZoom: number, anchorX = 0.5, anchorY = 0.5) => {
    setViewport((current) => {
      const zoom = clamp(nextZoom, 1, MAX_TREND_ZOOM);
      const visibleStartX = current.centreX - 0.5 / current.zoom;
      const visibleStartY = current.centreY - 0.5 / current.zoom;
      const anchorDataX = visibleStartX + anchorX / current.zoom;
      const anchorDataY = visibleStartY + anchorY / current.zoom;
      return clampViewport({
        zoom,
        centreX: anchorDataX - (anchorX - 0.5) / zoom,
        centreY: anchorDataY - (anchorY - 0.5) / zoom,
      });
    });
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (viewport.zoom === 1) return;
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, centreX: viewport.centreX, centreY: viewport.centreY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = (event.clientX - drag.clientX) / (rect.width * (plotWidth / width));
    const deltaY = (event.clientY - drag.clientY) / (rect.height * (plotHeight / height));
    setViewport(clampViewport({
      zoom: viewport.zoom,
      centreX: drag.centreX - deltaX / viewport.zoom,
      centreY: drag.centreY + deltaY / viewport.zoom,
    }));
  };

  const endPointerDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const panStep = 0.12 / viewport.zoom;
    if (event.key === "+" || event.key === "=") changeZoom(viewport.zoom * 1.5);
    else if (event.key === "-") changeZoom(viewport.zoom / 1.5);
    else if (event.key === "0" || event.key === "Home") setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 });
    else if (event.key === "ArrowLeft") setViewport((current) => clampViewport({ ...current, centreX: current.centreX - panStep }));
    else if (event.key === "ArrowRight") setViewport((current) => clampViewport({ ...current, centreX: current.centreX + panStep }));
    else if (event.key === "ArrowUp") setViewport((current) => clampViewport({ ...current, centreY: current.centreY + panStep }));
    else if (event.key === "ArrowDown") setViewport((current) => clampViewport({ ...current, centreY: current.centreY - panStep }));
    else return;
    event.preventDefault();
  };

  return (
    <div className="zoomable-chart">
      <div className="chart-zoom-controls" aria-label="Chart zoom controls">
        <span className="chart-data-policy">{graphEnd === null ? "All QA-valid values shown" : `Shown through ${numberFormat.format(graphEnd)} ${xUnit} · observed points only`}</span>
        <span>Scroll or +/− to zoom · drag or arrows to pan</span>
        <button type="button" onClick={() => changeZoom(viewport.zoom / 1.5)} disabled={viewport.zoom === 1} aria-label="Zoom out">−</button>
        <output aria-live="polite">{Math.round(viewport.zoom * 100)}%</output>
        <button type="button" onClick={() => changeZoom(viewport.zoom * 1.5)} disabled={viewport.zoom === MAX_TREND_ZOOM} aria-label="Zoom in">+</button>
        <button type="button" className="chart-reset-button" onClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })} disabled={viewport.zoom === 1}>Reset</button>
        <label className="chart-end-control">Graph end <input type="number" min={minimumTime} max={maximumTime} step="1" inputMode="numeric" value={displayedGraphEnd} aria-label={`Graph end (${xUnit})`} onChange={(event) => { setGraphEndInput(event.target.value); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} /><span>{xUnit}</span></label>
        <button type="button" className="chart-reset-button" onClick={() => { setGraphEndInput(null); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} disabled={graphEndInput === null}>Max</button>
        <span className="chart-export-divider" aria-hidden="true" />
        <button type="button" className="chart-export-button" onClick={() => {
          if (!svgRef.current) return;
          void exportPng(svgRef.current, exportTitle, exportSubtitle, exportSeries, exportStem, width, height).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "The PNG file could not be generated."));
        }}>Export PNG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, exportSeries, exportStem, width, height);
        }}>Export SVG</button>
      </div>
      <figure className="data-figure">
      <div className="chart-zoom-controls" aria-label="Y-axis scale">
        <button type="button" onClick={() => { setManualY(null); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} aria-pressed={manualY === null}>Auto Y</button>
        <button type="button" onClick={() => { setManualY({ min: String(fullYMin), max: String(fullYMax) }); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} aria-pressed={manualY !== null}>Manual Y</button>
        {manualY && <>
          <label>Y min <input aria-label="Y minimum" type="number" step="any" style={{ width: 90 }} value={manualY.min} onChange={(event) => { setManualY({ ...manualY, min: event.target.value }); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} /></label>
          <label>Y max <input aria-label="Y maximum" type="number" step="any" style={{ width: 90 }} value={manualY.max} onChange={(event) => { setManualY({ ...manualY, max: event.target.value }); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} /></label>
          {!manualYValid && <span role="alert">Enter finite bounds with min &lt; max. Auto scale used meanwhile.</span>}
        </>}
        <label><input type="checkbox" checked={showIntervals} onChange={(event) => { setShowIntervals(event.target.checked); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }} /> Show uncertainty intervals (95% CI / IQR)</label>
        <span role="status">{scaleNote}</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`Zoomable comparative evolution chart. ${graphEnd === null ? "All QA-valid values are displayed." : `QA-valid observations through ${numberFormat.format(graphEnd)} ${xUnit} are displayed without interpolation.`}`} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag} onDoubleClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })}>
        <defs><clipPath id="trend-plot-clip"><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Time ({xUnit})</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        {isRetention && yMin <= 100 && yMax >= 100 ? <g className="reference-baseline"><line x1={margin.left} x2={width - margin.right} y1={sy(100)} y2={sy(100)} /><text x={width - margin.right - 4} y={sy(100) - 6} textAnchor="end">Reference · 100%</text></g> : null}
        <g clipPath="url(#trend-plot-clip)">{plottedSeries.map((item, seriesIndex) => {
          const ordered = [...item.points].sort((a, b) => a.x - b.x);
          const path = ordered.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
          return <g key={item.label} data-export-series-index={seriesIndex}>
            {showIntervals && ordered.map((point) => <line key={`range-${point.x}`} x1={sx(point.x)} x2={sx(point.x)} y1={sy(point.intervalLow)} y2={sy(point.intervalHigh)} stroke={item.color} strokeWidth="1.5" opacity=".3"><title>{`${point.intervalLabel}: ${numberFormat.format(point.intervalLow)}–${numberFormat.format(point.intervalHigh)} ${yUnit}`}</title></line>)}
            <path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.linePattern} strokeLinejoin="round" strokeLinecap="round" />
            {ordered.map((point) => <circle className={`trend-point${point.selectedLabel ? " selected" : ""}`} key={`point-${point.x}`} cx={sx(point.x)} cy={sy(point.y)} r={point.selectedLabel ? "2.75" : "3.5"} fill={point.selectedLabel ? item.color : "white"} stroke={item.color} strokeWidth={point.selectedLabel ? "1.4" : "1.9"} tabIndex={0} role="img" aria-label={`${item.label}, ${numberFormat.format(point.x)} ${xUnit}, ${numberFormat.format(point.y)} ${yUnit}, ${point.selectedLabel ?? `n ${point.n}`}`}><title>{`${item.label} — ${numberFormat.format(point.x)} ${xUnit}: ${numberFormat.format(point.y)} ${yUnit}${point.selectedLabel ? ` · ${point.selectedLabel}` : ` (${point.intervalLabel} ${numberFormat.format(point.intervalLow)}–${numberFormat.format(point.intervalHigh)}, n=${point.n})`}`}</title></circle>)}
          </g>;
        })}</g>
      </svg>
      <figcaption className="visually-hidden">The line connects aggregate values by ageing duration. Vertical ranges show the 95% confidence interval for means or the interquartile range for medians. No statistical outlier is hidden. A graph-end limit excludes later observations without creating an interpolated point.</figcaption>
      </figure>
    </div>
  );
}

function interpolateAtX(points: Array<{ x: number; y: number }>, targetX: number): { x: number; y: number } | null {
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.x === targetX) return { x: targetX, y: left.y };
    if (targetX < Math.min(left.x, right.x) || targetX > Math.max(left.x, right.x) || left.x === right.x) continue;
    const ratio = (targetX - left.x) / (right.x - left.x);
    return { x: targetX, y: left.y + ratio * (right.y - left.y) };
  }
  return null;
}

function interpolateZeroCrossing(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  const crossings: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.y === 0 && left.x >= 0) crossings.push({ x: left.x, y: 0 });
    if (left.y * right.y > 0 || left.y === right.y) continue;
    const ratio = -left.y / (right.y - left.y);
    const x = left.x + ratio * (right.x - left.x);
    if (x >= 0) crossings.push({ x, y: 0 });
  }
  return crossings.sort((left, right) => left.x - right.x)[0] ?? null;
}

function curveLandmarks(points: Array<{ x: number; y: number }>, currentConvention: CurrentConvention) {
  const jsc = interpolateAtX(points, 0);
  const voc = interpolateZeroCrossing(points);
  const outputPolarity = currentConvention === "instrument" ? -1 : 1;
  const mpp = points
    .filter((point) => point.x >= 0 && point.y * outputPolarity >= 0)
    .map((point) => ({ ...point, power: point.x * point.y * outputPolarity }))
    .sort((left, right) => right.power - left.power)[0] ?? null;
  return { jsc, voc, mpp };
}

export function CurveChart({
  series,
  yAxisLabel,
  currentConvention,
  showPoints,
  showLandmarks,
  scaleMode,
}: {
  series: CurveSeries[];
  yAxisLabel: string;
  currentConvention: CurrentConvention;
  showPoints: boolean;
  showLandmarks: boolean;
  scaleMode: "primary" | "all";
}) {
  const [viewport, setViewport] = useState<TrendViewport>({ zoom: 1, centreX: 0.5, centreY: 0.5 });
  const dragRef = useRef<{ clientX: number; clientY: number; centreX: number; centreY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = CURVE_CHART_WIDTH;
  const height = CURVE_CHART_HEIGHT;
  const margin = CURVE_CHART_MARGIN;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY === 0) return;
      const rect = svg.getBoundingClientRect();
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const anchorX = clamp((((event.clientX - rect.left) / rect.width) * width - margin.left) / plotWidth, 0, 1);
      const anchorY = 1 - clamp((((event.clientY - rect.top) / rect.height) * height - margin.top) / plotHeight, 0, 1);
      setViewport((current) => {
        const zoom = clamp(current.zoom * (event.deltaY < 0 ? 1.3 : 1 / 1.3), 1, MAX_TREND_ZOOM);
        const visibleStartX = current.centreX - 0.5 / current.zoom;
        const visibleStartY = current.centreY - 0.5 / current.zoom;
        const anchorDataX = visibleStartX + anchorX / current.zoom;
        const anchorDataY = visibleStartY + anchorY / current.zoom;
        return clampViewport({ zoom, centreX: anchorDataX - (anchorX - 0.5) / zoom, centreY: anchorDataY - (anchorY - 0.5) / zoom });
      });
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [series.length, height, margin.bottom, margin.left, margin.right, margin.top, width]);

  if (!series.length) {
    return <div className="empty-chart"><strong>All curves are hidden</strong><span>Select a legend item to show a series again.</span></div>;
  }
  const all = series.flatMap((item) => item.segments.flatMap((segment) => segment.points));
  if (!all.length) {
    return <div className="empty-chart"><strong>No IV curve available</strong><span>Choose another time or broaden the filters.</span></div>;
  }
  const primary = series.flatMap((item) => item.segments.filter((segment) => segment.isPrimary).flatMap((segment) => segment.points));
  const scalePoints = scaleMode === "primary" && primary.length ? primary : all;
  const [fullXMin, fullXMax] = extent(scalePoints.map((point) => point.x));
  const [fullYMin, fullYMax] = extent(scalePoints.map((point) => point.y), true);
  const xSpan = (fullXMax - fullXMin) / viewport.zoom;
  const ySpan = (fullYMax - fullYMin) / viewport.zoom;
  const xMin = fullXMin + (viewport.centreX - 0.5 / viewport.zoom) * (fullXMax - fullXMin);
  const xMax = xMin + xSpan;
  const yMin = fullYMin + (viewport.centreY - 0.5 / viewport.zoom) * (fullYMax - fullYMin);
  const yMax = yMin + ySpan;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sx = (value: number) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * (width - margin.left - margin.right);
  const sy = (value: number) => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);
  const exportTitle = `IV curves — ${yAxisLabel}`;
  const exportSubtitle = `${currentConvention === "instrument" ? "Instrument current convention" : "Photovoltaic current convention"} · measured points connected in acquisition order · no smoothing`;
  const exportStem = exportFileStem("iv-curves", series);

  const changeZoom = (nextZoom: number) => setViewport((current) => clampViewport({ ...current, zoom: clamp(nextZoom, 1, MAX_TREND_ZOOM) }));
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (viewport.zoom === 1) return;
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, centreX: viewport.centreX, centreY: viewport.centreY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setViewport(clampViewport({
      zoom: viewport.zoom,
      centreX: drag.centreX - (event.clientX - drag.clientX) / (rect.width * (plotWidth / width) * viewport.zoom),
      centreY: drag.centreY + (event.clientY - drag.clientY) / (rect.height * (plotHeight / height) * viewport.zoom),
    }));
  };
  const endPointerDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const panStep = 0.12 / viewport.zoom;
    if (event.key === "+" || event.key === "=") changeZoom(viewport.zoom * 1.5);
    else if (event.key === "-") changeZoom(viewport.zoom / 1.5);
    else if (event.key === "0" || event.key === "Home") setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 });
    else if (event.key === "ArrowLeft") setViewport((current) => clampViewport({ ...current, centreX: current.centreX - panStep }));
    else if (event.key === "ArrowRight") setViewport((current) => clampViewport({ ...current, centreX: current.centreX + panStep }));
    else if (event.key === "ArrowUp") setViewport((current) => clampViewport({ ...current, centreY: current.centreY + panStep }));
    else if (event.key === "ArrowDown") setViewport((current) => clampViewport({ ...current, centreY: current.centreY - panStep }));
    else return;
    event.preventDefault();
  };

  return (
    <div className="zoomable-chart">
      <div className="chart-zoom-controls" aria-label="IV chart zoom controls">
        <span className="chart-data-policy">No smoothing · acquisition order retained</span>
        <span>Scroll or +/− to zoom · drag or arrows to pan</span>
        <button type="button" onClick={() => changeZoom(viewport.zoom / 1.5)} disabled={viewport.zoom === 1} aria-label="Zoom out">−</button>
        <output aria-live="polite">{Math.round(viewport.zoom * 100)}%</output>
        <button type="button" onClick={() => changeZoom(viewport.zoom * 1.5)} disabled={viewport.zoom === MAX_TREND_ZOOM} aria-label="Zoom in">+</button>
        <button type="button" className="chart-reset-button" onClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })} disabled={viewport.zoom === 1}>Reset</button>
        <span className="chart-export-divider" aria-hidden="true" />
        <button type="button" className="chart-export-button" onClick={() => {
          if (!svgRef.current) return;
          void exportPng(svgRef.current, exportTitle, exportSubtitle, series, exportStem, width, height).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "The PNG file could not be generated."));
        }}>Export PNG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, series, exportStem, width, height);
        }}>Export SVG</button>
      </div>
      <figure className="data-figure">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`Zoomable compared current–voltage curves, ${currentConvention === "instrument" ? "instrument" : "photovoltaic"} convention`} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag} onDoubleClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })}>
        <defs><clipPath id="curve-plot-clip"><rect x={margin.left} y={margin.top} width={width - margin.left - margin.right} height={height - margin.top - margin.bottom} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        {yMin < 0 && yMax > 0 ? <line className="zero-axis" x1={margin.left} x2={width - margin.right} y1={sy(0)} y2={sy(0)} /> : null}
        {xMin < 0 && xMax > 0 ? <line className="zero-axis vertical" x1={sx(0)} x2={sx(0)} y1={margin.top} y2={height - margin.bottom} /> : null}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Voltage (V)</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        <g clipPath="url(#curve-plot-clip)">
          {series.flatMap((item, seriesIndex) => item.segments.map((segment) => {
            const path = segment.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
            return <g key={segment.id} opacity={segment.isPrimary ? 1 : .48} data-export-series-index={seriesIndex}>
              <path d={path} fill="none" stroke={item.color} strokeWidth={segment.isPrimary ? 3.5 : 2.25} strokeDasharray={segment.isPrimary ? undefined : "7 5"} strokeLinejoin="round" strokeLinecap="round"><title>{`${item.label} — ${segment.isPrimary ? "primary sweep" : "retained segment"}`}</title></path>
              {showPoints ? segment.points.map((point) => <circle key={`${segment.id}-${point.sourceIndex}`} cx={sx(point.x)} cy={sy(point.y)} r={segment.isPrimary ? 2.2 : 1.8} fill="white" stroke={item.color} strokeWidth="1.3"><title>{`${item.label} — point ${point.sourceIndex + 1}: ${numberFormat.format(point.x)} V, ${numberFormat.format(point.y)} mA/cm²`}</title></circle>) : null}
            </g>;
          }))}
          {showLandmarks ? series.map((item) => {
            const segment = item.segments.find((candidate) => candidate.isPrimary);
            if (!segment) return null;
            const marks = curveLandmarks(segment.points, currentConvention);
            return <g className="curve-landmarks" key={`marks-${item.label}`} style={{ color: item.color }}>
              {marks.mpp ? <g><line className="landmark-guide" x1={sx(marks.mpp.x)} x2={sx(marks.mpp.x)} y1={sy(0)} y2={sy(marks.mpp.y)} stroke={item.color} /><line className="landmark-guide" x1={sx(0)} x2={sx(marks.mpp.x)} y1={sy(marks.mpp.y)} y2={sy(marks.mpp.y)} stroke={item.color} /><circle className="landmark-point" cx={sx(marks.mpp.x)} cy={sy(marks.mpp.y)} r="4.5" fill={item.color}><title>{`${item.label} — MPP: ${numberFormat.format(marks.mpp.x)} V, ${numberFormat.format(marks.mpp.y)} mA/cm², ${numberFormat.format(marks.mpp.power)} mW/cm²`}</title></circle><text className="landmark-label" x={sx(marks.mpp.x) + 7} y={sy(marks.mpp.y) - 7} fill={item.color}>MPP</text></g> : null}
              {marks.jsc ? <g><circle className="landmark-point hollow" cx={sx(marks.jsc.x)} cy={sy(marks.jsc.y)} r="4" fill="white" stroke={item.color}><title>{`${item.label} — Jsc: ${numberFormat.format(marks.jsc.y)} mA/cm²`}</title></circle><text className="landmark-label" x={sx(marks.jsc.x) + 7} y={sy(marks.jsc.y) - 7} fill={item.color}>Jsc</text></g> : null}
              {marks.voc ? <g><circle className="landmark-point hollow" cx={sx(marks.voc.x)} cy={sy(marks.voc.y)} r="4" fill="white" stroke={item.color}><title>{`${item.label} — Voc: ${numberFormat.format(marks.voc.x)} V`}</title></circle><text className="landmark-label" x={sx(marks.voc.x) + 7} y={sy(marks.voc.y) - 7} fill={item.color}>Voc</text></g> : null}
            </g>;
          }) : null}
        </g>
      </svg>
      <figcaption className="visually-hidden">Measured IV points are connected in acquisition order without smoothing. Use the controls, wheel, keyboard, or drag gesture to inspect the curve.</figcaption>
    </figure>
    </div>
  );
}

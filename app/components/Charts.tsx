"use client";

import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { legendElectrodesByKey, legendSelectionsByKey, pointsThrough, showTrendMarkers, trendDisplayValues, trendExportScaleWarning, trendIntervalVisible, uniqueLegendEntries } from "../lib/chart-export";
import { figureCsv, figureManifest, jvMethodCaption, type FigureExportContext, type FigureManifest } from "../lib/figure-export";
import { downloadFigureFile } from "../lib/browser-figure-download";
import { markerPath, segmentLinePattern, type MaterialStyle } from "../lib/material-style";
import { applyReportSvgStyle } from "../lib/report-svg";
import { figureXAxisLabel } from "../lib/figure-language";

export interface TrendPoint {
  x: number;
  y: number;
  min: number;
  max: number;
  intervalLow: number;
  intervalHigh: number;
  intervalLabel: "95% CI" | "IQR" | "single value" | "individual values";
  n: number;
  members: Array<{
    observationId: string;
    sampleUid: string;
    sampleLabel: string;
    sampleReference: string;
    batchNo?: string;
    value: number;
    trace?: import("../lib/normalization-trace").NormalizationTrace;
  }>;
  selectedLabel?: string;
}

export interface TrendSeries {
  marker?: MaterialStyle["marker"];
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
  marker?: MaterialStyle["marker"];
  id: string;
  label: string;
  color: string;
  linePattern?: string;
  segments: Array<{
    id: string;
    isPrimary: boolean;
    status?: "acquired" | "unresolved" | "suspected_export_residue";
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
  linePattern?: string;
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
  manifest?: FigureManifest,
  preset: "default" | "report" = "default",
): { content: string; width: number; height: number } {
  const legendSeries = uniqueLegendEntries(series);
  const legendRows = Math.max(1, Math.ceil(legendSeries.length / EXPORT_COLUMNS));
  const legendRowHeight = legendSeries.some((item) => item.exportDetail && item.exportSelection) ? 40 : legendSeries.some((item) => item.exportSelection || item.exportDetail) ? 30 : 20;
  const legendTop = subtitle ? 62 : 50;
  const headerHeight = legendTop - 8 + legendRows * legendRowHeight;
  const exportHeight = height + headerHeight;
  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("xmlns", SVG_NAMESPACE);
  root.setAttribute("viewBox", `0 0 ${width} ${exportHeight}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(exportHeight));
  if (manifest) {
    const metadata = document.createElementNS(SVG_NAMESPACE, "metadata");
    metadata.textContent = JSON.stringify(manifest);
    root.appendChild(metadata);
  }

  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = EXPORT_STYLES;
  root.appendChild(style);

  const background = document.createElementNS(SVG_NAMESPACE, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "white");
  root.appendChild(background);

  appendSvgText(root, title, 24, 24, "export-title");
  if (subtitle) appendSvgText(root, subtitle, 24, 42, "export-subtitle");
  const legend = document.createElementNS(SVG_NAMESPACE, "g");
  legend.setAttribute("class", "export-legend");
  legendSeries.forEach((item, index) => {
    const column = index % EXPORT_COLUMNS;
    const row = Math.floor(index / EXPORT_COLUMNS);
    const x = 24 + column * EXPORT_COLUMN_WIDTH;
    const y = legendTop + row * legendRowHeight;
    const marker = document.createElementNS(SVG_NAMESPACE, "line");
    marker.setAttribute("x1", String(x));
    marker.setAttribute("x2", String(x + 16));
    marker.setAttribute("y1", String(y - 3));
    marker.setAttribute("y2", String(y - 3));
    marker.setAttribute("stroke", item.color);
    marker.setAttribute("stroke-width", "3");
    const pattern = item.linePattern;
    if (pattern) marker.setAttribute("stroke-dasharray", pattern);
    legend.appendChild(marker);
    appendSvgText(legend, item.exportLabel ?? item.label, x + 22, y, "export-legend");
    if (item.exportDetail) appendSvgText(legend, item.exportDetail.slice(0, 48), x + 22, y + 11, "export-subtitle");
    if (item.exportSelection) appendSvgText(legend, item.exportSelection.slice(0, 48), x + 22, y + (item.exportDetail ? 22 : 11), "export-subtitle");
  });
  root.appendChild(legend);

  const chart = document.createElementNS(SVG_NAMESPACE, "g");
  chart.setAttribute("transform", `translate(0 ${headerHeight})`);
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("aria-label");
  clone.removeAttribute("role");
  clone.removeAttribute("tabindex");
  Array.from(clone.childNodes).forEach((child) => chart.appendChild(child));
  root.appendChild(chart);
  if (preset === "report") applyReportSvgStyle(root);

  return {
    content: new XMLSerializer().serializeToString(root),
    width,
    height: exportHeight,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  downloadFigureFile(blob,fileName,blob.type);
}

function exportSvg(source: SVGSVGElement, title: string, subtitle: string, series: ExportSeries[], fileStem: string, width: number, height: number, manifest?: FigureManifest, preset: "default" | "report" = "default") {
  const exported = serialiseChart(source, title, subtitle, series, width, height, manifest, preset);
  const stem = preset === "report" ? `${fileStem}.report` : fileStem;
  downloadBlob(new Blob([exported.content], { type: "image/svg+xml;charset=utf-8" }), `${stem}.svg`);
  if (manifest) downloadManifest(manifest, stem);
}

async function exportPng(source: SVGSVGElement, title: string, subtitle: string, series: ExportSeries[], fileStem: string, width: number, height: number, manifest?: FigureManifest) {
  const exported = serialiseChart(source, title, subtitle, series, width, height, manifest);
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
    if (manifest) downloadManifest(manifest, fileStem);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function downloadManifest(manifest: FigureManifest, stem: string) {
  downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), `${stem}.figure.json`);
}

function FigureDownloads({ manifest, stem }: { manifest: FigureManifest; stem: string }) {
  return <>
    <button type="button" onClick={() => downloadBlob(new Blob([figureCsv(manifest)], { type: "text/csv;charset=utf-8" }), `${stem}.figure.csv`)}>Data shown in this figure (CSV)</button>
    <button type="button" onClick={() => downloadManifest(manifest, stem)}>Figure manifest (JSON)</button>
    <button type="button" onClick={() => downloadBlob(new Blob([manifest.caption], { type: "text/plain;charset=utf-8" }), `${stem}.caption.txt`)}>Caption</button>
    <button type="button" onClick={() => void navigator.clipboard.writeText(manifest.caption).catch(() => downloadBlob(new Blob([manifest.caption], { type: "text/plain;charset=utf-8" }), `${stem}.caption.txt`))}>Copy caption</button>
    <span title="SVG and PNG use a white publication background and retain the displayed colours and line patterns. A companion JSON records data, selection, provenance and view limits. CSV retains analytically plotted points outside the viewport and explicitly identifies clipping.">Publication · white ⓘ</span>
  </>;
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
  reportYAxisLabel,
  exportContext = {},
}: {
  series: TrendSeries[];
  xUnit: string;
  yUnit: string;
  reportTitle?: string;
  reportYAxisLabel?: string;
  exportContext?: FigureExportContext;
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
  const allValues = trendDisplayValues(all, showIntervals);
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
  const legendSelections = legendSelectionsByKey(plottedSeries);
  const selectedSamples = Array.isArray(exportContext.selectedSampleMetadata)
    ? exportContext.selectedSampleMetadata as import("../lib/iv-data").Sample[] : [];
  const electrodeBySample = new Map(selectedSamples.map((sample) => [sample.sample_uid, sample.electrode]));
  const legendElectrodes = legendElectrodesByKey(plottedSeries, electrodeBySample);
  const exportSeries = plottedSeries.map((item) => ({
    ...item,
    exportDetail: electrodeBySample.size ? legendElectrodes.get(item.exportLegendKey ?? item.label) : item.exportDetail,
    exportSelection: legendSelections.get(item.exportLegendKey ?? item.label),
  }));
  const exportTitle = reportTitle ?? `Évolution au cours du temps — ${yUnit}`;
  const scaleNote = `${manualYValid ? "Manual" : "Auto"} Y: ${numberFormat.format(yMin)}–${numberFormat.format(yMax)} ${yUnit}${clippedY ? " · values or intervals clipped" : ""}${showIntervals ? "" : " · uncertainty intervals hidden"}`;
  const exportSubtitle = trendExportScaleWarning(clippedY, showIntervals);
  const yAxisLabel = reportYAxisLabel ?? yUnit;
  const exportStem = exportFileStem(graphEnd === null ? "performance-over-time" : `performance-over-time-through-${graphEnd}-${xUnit}`, exportSeries);
  const manifest = figureManifest({ kind: "trend", title: exportTitle, caption: [exportTitle, exportSubtitle, exportContext.methodCaption, "Les lignes relient les durées mesurées ; aucune interpolation temporelle"].filter(Boolean).join(". ") + ".", context: exportContext,
    xUnit, yUnit, analyticLimit: { maximumX: graphEnd, interpolation: "none" }, viewport: { xMin, xMax, yMin, yMax },
    intervalsVisible: showIntervals, series: exportSeries, display: { zoom: viewport.zoom, yScale: manualYValid ? "manual" : "auto", clippedY, smallSampleMembersShown: true } });

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
        <span className="chart-data-policy">{graphEnd === null ? "Selected analytical data" : `Through ${numberFormat.format(graphEnd)} ${xUnit} · observed points only`}</span>
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
          void exportPng(svgRef.current, exportTitle, exportSubtitle, exportSeries, exportStem, width, height, manifest).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "The PNG file could not be generated."));
        }}>Export PNG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, exportSeries, exportStem, width, height, manifest);
        }}>Export SVG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, exportSeries, exportStem, width, height, manifest, "report");
        }}>Report SVG</button>
        <FigureDownloads manifest={manifest} stem={exportStem} />
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
        {all.some((point) => !point.selectedLabel && point.n < 3) && <span title="For one or two contributing cells, individual values are drawn. An interval cannot establish population precision from such a small sample.">Small n: individual values shown</span>}
        {showIntervals && all.some(point => trendIntervalVisible(point, true) && point.intervalLabel === "95% CI" && point.n < 5) && <span role="status">Small-n 95% CI: highly uncertain, shown without truncation. Points show the observed spread.</span>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`Zoomable comparative evolution chart. ${graphEnd === null ? "All QA-valid values are displayed." : `QA-valid observations through ${numberFormat.format(graphEnd)} ${xUnit} are displayed without interpolation.`}`} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag} onDoubleClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })}>
        <defs><clipPath id="trend-plot-clip"><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">{figureXAxisLabel(xUnit)}</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        {isRetention && yMin <= 100 && yMax >= 100 ? <g className="reference-baseline"><line x1={margin.left} x2={width - margin.right} y1={sy(100)} y2={sy(100)} /><text x={width - margin.right - 4} y={sy(100) - 6} textAnchor="end">Référence · 100 %</text></g> : null}
        <g clipPath="url(#trend-plot-clip)">{plottedSeries.map((item, seriesIndex) => {
          const ordered = [...item.points].sort((a, b) => a.x - b.x);
          const path = ordered.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
          const visibleMarkers = showTrendMarkers(xUnit, ordered.length);
          return <g key={item.label} data-export-series-index={seriesIndex}>
            {ordered.filter(point => trendIntervalVisible(point, showIntervals)).map((point) => <line key={`range-${point.x}`} x1={sx(point.x)} x2={sx(point.x)} y1={sy(point.intervalLow)} y2={sy(point.intervalHigh)} stroke={item.color} strokeWidth="1.5" opacity=".3"><title>{`${point.intervalLabel}: ${numberFormat.format(point.intervalLow)}–${numberFormat.format(point.intervalHigh)} ${yUnit}; n=${point.n}`}</title></line>)}
            {visibleMarkers && ordered.filter((point) => !point.selectedLabel).flatMap((point) => point.members.map((member) => <path key={`member-${point.x}-${member.observationId}`} d={markerPath(item.marker,sx(point.x),sy(member.value),3)} fill={item.color} opacity=".7"><title>{`${member.sampleLabel} (${member.sampleUid}; batch ${member.batchNo ?? "not recorded"}): ${numberFormat.format(member.value)} ${yUnit}; n=${point.n}`}</title></path>))}
            <path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.linePattern} strokeLinejoin="round" strokeLinecap="round" />
            {ordered.map((point) => <path className={visibleMarkers ? `trend-point${point.selectedLabel ? " selected" : ""}` : "trend-point-hit"} key={`point-${point.x}`} d={markerPath(visibleMarkers ? item.marker : "circle",sx(point.x),sy(point.y),visibleMarkers ? point.selectedLabel ? 2.75 : 3.5 : 6)} fill={visibleMarkers ? point.selectedLabel ? item.color : "white" : "transparent"} stroke={item.color} strokeOpacity={visibleMarkers ? 1 : 0} strokeWidth={visibleMarkers ? point.selectedLabel ? "1.4" : "1.9" : 1.5} tabIndex={0} role="img" aria-label={`${item.label}, ${numberFormat.format(point.x)} ${xUnit}, ${numberFormat.format(point.y)} ${yUnit}, ${point.selectedLabel ?? `n ${point.n}`}`}><title>{`${item.label} — ${numberFormat.format(point.x)} ${xUnit}: ${numberFormat.format(point.y)} ${yUnit}${point.selectedLabel ? ` · ${point.selectedLabel}` : ` (${point.intervalLabel} ${numberFormat.format(point.intervalLow)}–${numberFormat.format(point.intervalHigh)}, n=${point.n})`}`}</title></path>)}
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
  exportContext = {},
}: {
  series: CurveSeries[];
  yAxisLabel: string;
  currentConvention: CurrentConvention;
  showPoints: boolean;
  showLandmarks: boolean;
  scaleMode: "primary" | "all";
  exportContext?: FigureExportContext;
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
  const exportTitle = `${exportContext.validation?.quantitativeValidated === false ? "INSPECTION NON VALIDÉE — " : ""}Courbes JV — ${yAxisLabel}`;
  const exportSubtitle = `${currentConvention === "instrument" ? "Convention instrumentale" : "Convention photovoltaïque"} · points mesurés reliés dans l’ordre d’acquisition · sans lissage`;
  const exportStem = exportFileStem("iv-curves", series);
  const manifest = figureManifest({ kind: "jv", title: exportTitle, caption: `${exportTitle}. ${exportSubtitle}. ${exportContext.methodCaption??""} ${jvMethodCaption(exportContext,series)}`, context: exportContext,
    xUnit: "V", yUnit: yAxisLabel, analyticLimit: { maximumX: null, interpolation: "none" }, viewport: { xMin, xMax, yMin, yMax },
    intervalsVisible: false, series, display: { currentConvention, scaleMode, showPoints, showLandmarks, zoom: viewport.zoom } });

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
          void exportPng(svgRef.current, exportTitle, exportSubtitle, series, exportStem, width, height, manifest).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "The PNG file could not be generated."));
        }}>Export PNG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, series, exportStem, width, height, manifest);
        }}>Export SVG</button>
        <button type="button" className="chart-export-button" onClick={() => {
          if (svgRef.current) exportSvg(svgRef.current, exportTitle, exportSubtitle, series, exportStem, width, height, manifest, "report");
        }}>Report SVG</button>
        <FigureDownloads manifest={manifest} stem={exportStem} />
      </div>
      <figure className="data-figure">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`Zoomable compared current–voltage curves, ${currentConvention === "instrument" ? "instrument" : "photovoltaic"} convention`} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag} onDoubleClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })}>
        <defs><clipPath id="curve-plot-clip"><rect x={margin.left} y={margin.top} width={width - margin.left - margin.right} height={height - margin.top - margin.bottom} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        {yMin < 0 && yMax > 0 ? <line className="zero-axis" x1={margin.left} x2={width - margin.right} y1={sy(0)} y2={sy(0)} /> : null}
        {xMin < 0 && xMax > 0 ? <line className="zero-axis vertical" x1={sx(0)} x2={sx(0)} y1={margin.top} y2={height - margin.bottom} /> : null}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Tension (V)</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        <g clipPath="url(#curve-plot-clip)">
          {series.flatMap((item, seriesIndex) => item.segments.map((segment) => {
            const path = segment.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
            return <g key={segment.id} opacity={segment.isPrimary ? 1 : .48} data-export-series-index={seriesIndex}>
              <path d={path} fill="none" stroke={item.color} strokeWidth={segment.isPrimary ? 3.5 : 2.25} strokeDasharray={segmentLinePattern(segment.isPrimary,segment.status,item.linePattern)} strokeLinejoin="round" strokeLinecap="round"><title>{`${item.label} — ${segment.isPrimary ? "primary sweep" : "retained segment"} · ${segment.status??"unresolved"}`}</title></path>
              {showPoints ? segment.points.map((point) => <path key={`${segment.id}-${point.sourceIndex}`} d={markerPath(item.marker,sx(point.x),sy(point.y),segment.isPrimary?2.2:1.8)} fill="white" stroke={item.color} strokeWidth="1.3"><title>{`${item.label} — point ${point.sourceIndex + 1}: ${numberFormat.format(point.x)} V, ${numberFormat.format(point.y)} mA/cm²`}</title></path>) : null}
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

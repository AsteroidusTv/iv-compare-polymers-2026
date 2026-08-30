"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { InfoTip } from "./InfoTip";

export interface TrendPoint {
  x: number;
  y: number;
  min: number;
  max: number;
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

type TrendViewport = { zoom: number; centreX: number; centreY: number };
type TrendRangeMode = "readable" | "all";

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

function quantile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sortedValues[lower] + (sortedValues[Math.min(lower + 1, sortedValues.length - 1)] - sortedValues[lower]) * fraction;
}

function readableOutlierKeys(series: TrendSeries[]): Set<string> {
  const keys = new Set<string>();
  series.forEach((item) => {
    const values = item.points.map((point) => point.y).filter(Number.isFinite).sort((left, right) => left - right);
    if (values.length < 8) return;
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    if (iqr <= 0) return;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    item.points.forEach((point) => {
      if (!point.selectedLabel && (point.y < lowerFence || point.y > upperFence)) keys.add(`${item.id}:${point.x}`);
    });
  });
  return keys;
}

function splitVisibleTrendPoints(points: TrendPoint[], isHidden: (point: TrendPoint) => boolean): TrendPoint[][] {
  const chunks: TrendPoint[][] = [];
  let current: TrendPoint[] = [];
  points.forEach((point) => {
    if (isHidden(point)) {
      if (current.length) chunks.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length) chunks.push(current);
  return chunks;
}

export function TrendChart({ series, xUnit, yUnit }: { series: TrendSeries[]; xUnit: string; yUnit: string }) {
  const [viewport, setViewport] = useState<TrendViewport>({ zoom: 1, centreX: 0.5, centreY: 0.5 });
  const [rangeMode, setRangeMode] = useState<TrendRangeMode>("readable");
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
  const all = series.flatMap((item) => item.points);
  if (!all.length) {
    return <div className="empty-chart"><strong>No comparable points</strong><span>Broaden the filters or choose another condition.</span></div>;
  }
  const outlierKeys = readableOutlierKeys(series);
  const isOutlier = (seriesId: string, point: TrendPoint) => outlierKeys.has(`${seriesId}:${point.x}`);
  const readablePoints = series.flatMap((item) => item.points.filter((point) => !isOutlier(item.id, point)));
  const scalePoints = rangeMode === "readable" && readablePoints.length ? readablePoints : all;
  const [fullXMin, fullXMax] = extent(all.map((point) => point.x));
  const [fullYMin, fullYMax] = rangeMode === "readable"
    ? extent(scalePoints.map((point) => point.y))
    : extent(all.flatMap((point) => [point.min, point.max]), true);
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
  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);

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

  return (
    <div className="zoomable-chart">
      <div className="chart-zoom-controls" aria-label="Chart zoom controls">
        <span className="chart-range-mode" role="group" aria-label="Displayed value range">
          <button type="button" className={rangeMode === "readable" ? "active" : ""} aria-pressed={rangeMode === "readable"} onClick={() => { setRangeMode("readable"); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }}>Readable range</button>
          <button type="button" className={rangeMode === "all" ? "active" : ""} aria-pressed={rangeMode === "all"} onClick={() => { setRangeMode("all"); setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 }); }}>All values</button>
          <InfoTip text="Readable range hides only statistically isolated points from the chart using Tukey's 1.5×IQR rule, calculated separately for each series. No source value is deleted: all observations remain in the table and reappear with ‘All values’." align="left" />
          {rangeMode === "readable" && outlierKeys.size ? <small>{outlierKeys.size} isolated point{outlierKeys.size > 1 ? "s" : ""} retained outside this view</small> : null}
        </span>
        <span>Scroll to zoom · drag to pan</span>
        <button type="button" onClick={() => changeZoom(viewport.zoom / 1.5)} disabled={viewport.zoom === 1} aria-label="Zoom out">−</button>
        <output aria-live="polite">{Math.round(viewport.zoom * 100)}%</output>
        <button type="button" onClick={() => changeZoom(viewport.zoom * 1.5)} disabled={viewport.zoom === MAX_TREND_ZOOM} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })} disabled={viewport.zoom === 1}>Reset</button>
      </div>
      <figure className="data-figure">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Zoomable comparative evolution chart" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag} onDoubleClick={() => setViewport({ zoom: 1, centreX: 0.5, centreY: 0.5 })}>
        <defs><clipPath id="trend-plot-clip"><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Time ({xUnit})</text>
        <text className="axis-title" x={margin.left} y={14}>{yUnit}</text>
        <g clipPath="url(#trend-plot-clip)">{series.map((item) => {
          const ordered = [...item.points].sort((a, b) => a.x - b.x);
          const hidden = (point: TrendPoint) => rangeMode === "readable" && isOutlier(item.id, point);
          const chunks = splitVisibleTrendPoints(ordered, hidden);
          const visiblePoints = ordered.filter((point) => !hidden(point));
          return <g key={item.label}>
            {visiblePoints.map((point) => <line key={`range-${point.x}`} x1={sx(point.x)} x2={sx(point.x)} y1={sy(point.min)} y2={sy(point.max)} stroke={item.color} strokeWidth="1.5" opacity=".22" />)}
            {chunks.map((chunk, chunkIndex) => {
              const path = chunk.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
              return <path key={`path-${chunkIndex}`} d={path} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />;
            })}
            {visiblePoints.map((point) => <circle className={`trend-point${point.selectedLabel ? " selected" : ""}`} key={`point-${point.x}`} cx={sx(point.x)} cy={sy(point.y)} r={point.selectedLabel ? "2.25" : "3"} fill={point.selectedLabel ? item.color : "white"} stroke={item.color} strokeWidth={point.selectedLabel ? "1.2" : "1.8"}><title>{`${item.label} — ${numberFormat.format(point.x)} ${xUnit}: ${numberFormat.format(point.y)} ${yUnit}${point.selectedLabel ? ` · ${point.selectedLabel}` : ` (n=${point.n})`}`}</title></circle>)}
          </g>;
        })}</g>
      </svg>
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
  if (!series.length) {
    return <div className="empty-chart"><strong>All curves are hidden</strong><span>Select a legend item to show a series again.</span></div>;
  }
  const all = series.flatMap((item) => item.segments.flatMap((segment) => segment.points));
  if (!all.length) {
    return <div className="empty-chart"><strong>No IV curve available</strong><span>Choose another time or broaden the filters.</span></div>;
  }
  const primary = series.flatMap((item) => item.segments.filter((segment) => segment.isPrimary).flatMap((segment) => segment.points));
  const scalePoints = scaleMode === "primary" && primary.length ? primary : all;
  const [xMin, xMax] = extent(scalePoints.map((point) => point.x));
  const [yMin, yMax] = extent(scalePoints.map((point) => point.y), true);
  const width = 900;
  const height = 360;
  const margin = { left: 64, right: 22, top: 24, bottom: 50 };
  const sx = (value: number) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * (width - margin.left - margin.right);
  const sy = (value: number) => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);

  return (
    <figure className="data-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Compared current–voltage curves, ${currentConvention === "instrument" ? "instrument" : "photovoltaic"} convention`}>
        <defs><clipPath id="curve-plot-clip"><rect x={margin.left} y={margin.top} width={width - margin.left - margin.right} height={height - margin.top - margin.bottom} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{numberFormat.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{numberFormat.format(tick)}</text></g>)}
        {yMin < 0 && yMax > 0 ? <line className="zero-axis" x1={margin.left} x2={width - margin.right} y1={sy(0)} y2={sy(0)} /> : null}
        {xMin < 0 && xMax > 0 ? <line className="zero-axis vertical" x1={sx(0)} x2={sx(0)} y1={margin.top} y2={height - margin.bottom} /> : null}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Voltage (V)</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        <g clipPath="url(#curve-plot-clip)">
          {series.flatMap((item) => item.segments.map((segment) => {
            const path = segment.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
            return <g key={segment.id} opacity={segment.isPrimary ? 1 : .48}>
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
    </figure>
  );
}

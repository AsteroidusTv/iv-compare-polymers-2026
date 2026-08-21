export interface TrendPoint {
  x: number;
  y: number;
  min: number;
  max: number;
  n: number;
}

export interface TrendSeries {
  label: string;
  color: string;
  points: TrendPoint[];
}

export interface CurveSeries {
  label: string;
  color: string;
  segments: Array<{
    id: string;
    isPrimary: boolean;
    points: Array<{ x: number; y: number; sourceIndex: number }>;
  }>;
}

type CurrentConvention = "instrument" | "pv";

const fr = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });

function extent(values: number[], includeZero = false): [number, number] {
  if (!values.length) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
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

export function TrendChart({ series, xUnit, yUnit }: { series: TrendSeries[]; xUnit: string; yUnit: string }) {
  const all = series.flatMap((item) => item.points);
  if (!all.length) {
    return <div className="empty-chart"><strong>Aucun point comparable</strong><span>Élargissez les filtres ou choisissez une autre condition.</span></div>;
  }
  const [xMin, xMax] = extent(all.map((point) => point.x));
  const [yMin, yMax] = extent(all.flatMap((point) => [point.min, point.max]), true);
  const width = 900;
  const height = 360;
  const margin = { left: 64, right: 22, top: 24, bottom: 50 };
  const sx = (value: number) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * (width - margin.left - margin.right);
  const sy = (value: number) => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);

  return (
    <figure className="data-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graphique d’évolution comparative">
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{fr.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{fr.format(tick)}</text></g>)}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Temps ({xUnit})</text>
        <text className="axis-title" x={margin.left} y={14}>{yUnit}</text>
        {series.map((item) => {
          const ordered = [...item.points].sort((a, b) => a.x - b.x);
          const path = ordered.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
          return <g key={item.label}>
            {ordered.map((point) => <line key={`range-${point.x}`} x1={sx(point.x)} x2={sx(point.x)} y1={sy(point.min)} y2={sy(point.max)} stroke={item.color} strokeWidth="2" opacity=".25" />)}
            <path d={path} fill="none" stroke={item.color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {ordered.map((point) => <circle key={`point-${point.x}`} cx={sx(point.x)} cy={sy(point.y)} r="5.5" fill="white" stroke={item.color} strokeWidth="3"><title>{`${item.label} — ${fr.format(point.x)} ${xUnit}: ${fr.format(point.y)} ${yUnit} (n=${point.n})`}</title></circle>)}
          </g>;
        })}
      </svg>
    </figure>
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
  const all = series.flatMap((item) => item.segments.flatMap((segment) => segment.points));
  if (!all.length) {
    return <div className="empty-chart"><strong>Aucune courbe IV disponible</strong><span>Choisissez un autre temps ou élargissez les filtres.</span></div>;
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Courbes courant-tension comparées, convention ${currentConvention === "instrument" ? "instrument" : "photovoltaïque"}`}>
        <defs><clipPath id="curve-plot-clip"><rect x={margin.left} y={margin.top} width={width - margin.left - margin.right} height={height - margin.top - margin.bottom} /></clipPath></defs>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{fr.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{fr.format(tick)}</text></g>)}
        {yMin < 0 && yMax > 0 ? <line className="zero-axis" x1={margin.left} x2={width - margin.right} y1={sy(0)} y2={sy(0)} /> : null}
        {xMin < 0 && xMax > 0 ? <line className="zero-axis vertical" x1={sx(0)} x2={sx(0)} y1={margin.top} y2={height - margin.bottom} /> : null}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Tension (V)</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        <g clipPath="url(#curve-plot-clip)">
          {series.flatMap((item) => item.segments.map((segment) => {
            const path = segment.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
            return <g key={segment.id} opacity={segment.isPrimary ? 1 : .48}>
              <path d={path} fill="none" stroke={item.color} strokeWidth={segment.isPrimary ? 3.5 : 2.25} strokeDasharray={segment.isPrimary ? undefined : "7 5"} strokeLinejoin="round" strokeLinecap="round"><title>{`${item.label} — ${segment.isPrimary ? "balayage principal" : "segment conservé"}`}</title></path>
              {showPoints ? segment.points.map((point) => <circle key={`${segment.id}-${point.sourceIndex}`} cx={sx(point.x)} cy={sy(point.y)} r={segment.isPrimary ? 2.2 : 1.8} fill="white" stroke={item.color} strokeWidth="1.3"><title>{`${item.label} — point ${point.sourceIndex + 1}: ${fr.format(point.x)} V, ${fr.format(point.y)} mA/cm²`}</title></circle>) : null}
            </g>;
          }))}
          {showLandmarks ? series.map((item) => {
            const segment = item.segments.find((candidate) => candidate.isPrimary);
            if (!segment) return null;
            const marks = curveLandmarks(segment.points, currentConvention);
            return <g className="curve-landmarks" key={`marks-${item.label}`} style={{ color: item.color }}>
              {marks.mpp ? <g><line className="landmark-guide" x1={sx(marks.mpp.x)} x2={sx(marks.mpp.x)} y1={sy(0)} y2={sy(marks.mpp.y)} stroke={item.color} /><line className="landmark-guide" x1={sx(0)} x2={sx(marks.mpp.x)} y1={sy(marks.mpp.y)} y2={sy(marks.mpp.y)} stroke={item.color} /><circle className="landmark-point" cx={sx(marks.mpp.x)} cy={sy(marks.mpp.y)} r="4.5" fill={item.color}><title>{`${item.label} — MPP: ${fr.format(marks.mpp.x)} V, ${fr.format(marks.mpp.y)} mA/cm², ${fr.format(marks.mpp.power)} mW/cm²`}</title></circle><text className="landmark-label" x={sx(marks.mpp.x) + 7} y={sy(marks.mpp.y) - 7} fill={item.color}>MPP</text></g> : null}
              {marks.jsc ? <g><circle className="landmark-point hollow" cx={sx(marks.jsc.x)} cy={sy(marks.jsc.y)} r="4" fill="white" stroke={item.color}><title>{`${item.label} — Jsc: ${fr.format(marks.jsc.y)} mA/cm²`}</title></circle><text className="landmark-label" x={sx(marks.jsc.x) + 7} y={sy(marks.jsc.y) - 7} fill={item.color}>Jsc</text></g> : null}
              {marks.voc ? <g><circle className="landmark-point hollow" cx={sx(marks.voc.x)} cy={sy(marks.voc.y)} r="4" fill="white" stroke={item.color}><title>{`${item.label} — Voc: ${fr.format(marks.voc.x)} V`}</title></circle><text className="landmark-label" x={sx(marks.voc.x) + 7} y={sy(marks.voc.y) - 7} fill={item.color}>Voc</text></g> : null}
            </g>;
          }) : null}
        </g>
      </svg>
    </figure>
  );
}

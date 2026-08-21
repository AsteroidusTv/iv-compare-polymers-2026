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
  points: Array<{ x: number; y: number }>;
}

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

export function CurveChart({ series, yAxisLabel }: { series: CurveSeries[]; yAxisLabel: string }) {
  const all = series.flatMap((item) => item.points);
  if (!all.length) {
    return <div className="empty-chart"><strong>Aucune courbe IV disponible</strong><span>Choisissez un autre temps ou élargissez les filtres.</span></div>;
  }
  const [xMin, xMax] = extent(all.map((point) => point.x));
  const [yMin, yMax] = extent(all.map((point) => point.y), true);
  const width = 900;
  const height = 360;
  const margin = { left: 64, right: 22, top: 24, bottom: 50 };
  const sx = (value: number) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * (width - margin.left - margin.right);
  const sy = (value: number) => height - margin.bottom - ((value - yMin) / (yMax - yMin || 1)) * (height - margin.top - margin.bottom);
  const xTicks = ticks(xMin, xMax);
  const yTicks = ticks(yMin, yMax);

  return (
    <figure className="data-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbes courant-tension comparées">
        {yTicks.map((tick) => <g key={`y-${tick}`}><line className="grid-line" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="axis-label" x={margin.left - 12} y={sy(tick) + 4} textAnchor="end">{fr.format(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="tick-line" x1={sx(tick)} x2={sx(tick)} y1={height - margin.bottom} y2={height - margin.bottom + 6} /><text className="axis-label" x={sx(tick)} y={height - 20} textAnchor="middle">{fr.format(tick)}</text></g>)}
        {yMin < 0 && yMax > 0 ? <line className="zero-line" x1={margin.left} x2={width - margin.right} y1={sy(0)} y2={sy(0)} /> : null}
        <line className="axis-line" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
        <text className="axis-title" x={width - margin.right} y={height - 5} textAnchor="end">Tension (V)</text>
        <text className="axis-title" x={margin.left} y={14}>{yAxisLabel}</text>
        {series.map((item) => {
          const path = item.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" ");
          return <path key={item.label} d={path} fill="none" stroke={item.color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"><title>{item.label}</title></path>;
        })}
      </svg>
    </figure>
  );
}

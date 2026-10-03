import type { synchronizedMetrics } from "../lib/synchronized-metrics";
import { figureXAxisLabel } from "../lib/figure-language";

type Panel = ReturnType<typeof synchronizedMetrics>["panels"][number];
const styles = {
  efficiency_pct: { label: "PCE", color: "#222222", dash: "", marker: "circle" },
  jsc_mA_cm2: { label: "Jsc", color: "#c65d00", dash: "10 5", marker: "square" },
  voc_V: { label: "Voc", color: "#0072b2", dash: "3 5", marker: "triangle" },
  ff_pct: { label: "FF", color: "#843c98", dash: "12 4 3 4", marker: "diamond" },
} as const;

function Marker({ x, y, metric }: { x: number; y: number; metric: Panel["metric"] }) {
  const style = styles[metric];
  if (style.marker === "square") return <rect x={x - 4} y={y - 4} width={8} height={8} fill={style.color} />;
  if (style.marker === "triangle") return <path d={`M${x} ${y - 5}l5 9h-10Z`} fill={style.color} />;
  if (style.marker === "diamond") return <path d={`M${x} ${y - 5}l5 5l-5 5l-5 -5Z`} fill={style.color} />;
  return <circle cx={x} cy={y} r={4} fill="white" stroke={style.color} strokeWidth={2} />;
}

/** Presentation only: null cells break segments; no metric-specific interpolation. */
export function MetricOverlay({ panels, sampleUid, subtitle, min, max, end, unit, clipId }: {
  panels: Panel[]; sampleUid: string; subtitle: string; min: number; max: number;
  end: number; unit: string; clipId: string;
}) {
  const left = 85, top = 125, pw = 1035, ph = 390;
  const x = (value: number) => left + value / Math.max(1, end) * pw;
  const y = (value: number) => top + ph - (value - min) / (max - min) * ph;
  return <g>
    <text x={590} y={50} textAnchor="middle" fontSize={13}>{subtitle}</text>
    {panels.map((panel, i) => {
      const style = styles[panel.metric], lx = 170 + i * 240;
      return <g key={panel.metric}><line x1={lx} x2={lx + 40} y1={80} y2={80} stroke={style.color} strokeWidth={2.5} strokeDasharray={style.dash} /><Marker x={lx + 20} y={80} metric={panel.metric} /><text x={lx + 50} y={85} fontSize={14}>{style.label}</text></g>;
    })}
    <text x={left} y={top - 14} fontSize={13}>Rétention (% de la valeur Unaged)</text>
    <defs><clipPath id={clipId}><rect x={left} y={top} width={pw} height={ph} /></clipPath></defs>
    {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map(value => <g key={value}><line x1={left} x2={left + pw} y1={y(value)} y2={y(value)} stroke="#e0e0e0" /><text x={left - 10} y={y(value) + 4} textAnchor="end" fontSize={12}>{Number(value.toFixed(1))}</text></g>)}
    <line x1={left} x2={left + pw} y1={top + ph} y2={top + ph} stroke="#666" />
    {Array.from({ length: 6 }, (_, i) => end * i / 5).map((value, i) => <text key={i} x={x(value)} y={top + ph + 24} textAnchor="middle" fontSize={12}>{Number(value.toFixed(1))}</text>)}
    <text x={left + pw} y={top + ph + 48} textAnchor="end" fontSize={13}>{figureXAxisLabel(unit)}</text>
    <g clipPath={`url(#${clipId})`}>
      <line x1={left} x2={left + pw} y1={y(100)} y2={y(100)} stroke="#888" strokeDasharray="5 5" />
      {panels.map(panel => {
        const cells = panel.cells.filter(cell => cell.sampleUid === sampleUid), style = styles[panel.metric];
        return <g key={panel.metric} aria-label={style.label}>{cells.map((cell, i) => {
          const previous = cells[i - 1];
          if (cell.value === null) return null;
          return <g key={cell.time}>
            {previous?.value != null && <line x1={x(previous.time)} x2={x(cell.time)} y1={y(previous.value)} y2={y(cell.value)} stroke={style.color} strokeWidth={2.3} strokeDasharray={style.dash} />}
            <g><title>{`${style.label} · ${cell.time} ${unit} : ${cell.value.toFixed(2)} % · valeur ${cell.trace?.absoluteValue}, référence ${cell.trace?.baseline?.value}`}</title><Marker x={x(cell.time)} y={y(cell.value)} metric={panel.metric} /></g>
          </g>;
        })}</g>;
      })}
    </g>
  </g>;
}

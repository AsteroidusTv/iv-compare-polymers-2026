import type { synchronizedMetrics } from "../lib/synchronized-metrics";
import { figureXAxisLabel } from "../lib/figure-language";

type Panel = ReturnType<typeof synchronizedMetrics>["panels"][number];
const styles = {
  efficiency_pct: { label: "PCE", color: "#17233b", dash: "", marker: "circle" },
  jsc_mA_cm2: { label: "Jsc", color: "#c65d00", dash: "10 5", marker: "square" },
  voc_V: { label: "Voc", color: "#0072b2", dash: "3 5", marker: "triangle" },
  ff_pct: { label: "FF", color: "#843c98", dash: "12 4 3 4", marker: "diamond" },
} as const;

function Marker({ x, y, metric }: { x: number; y: number; metric: Panel["metric"] }) {
  const style = styles[metric];
  const ink = {fill:"white",stroke:style.color,strokeWidth:1.9};
  if (style.marker === "square") return <rect x={x - 4} y={y - 4} width={8} height={8} {...ink} />;
  if (style.marker === "triangle") return <path d={`M${x} ${y - 5}l5 9h-10Z`} {...ink} />;
  if (style.marker === "diamond") return <path d={`M${x} ${y - 5}l5 5l-5 5l-5 -5Z`} {...ink} />;
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
    <text x={32} y={52} fontSize={14} fill="#737b88">{subtitle}</text>
    {panels.map((panel, i) => {
      const style = styles[panel.metric], lx = 170 + i * 240;
      return <g key={panel.metric}><line x1={lx} x2={lx + 40} y1={80} y2={80} stroke={style.color} strokeWidth={3} strokeDasharray={style.dash} strokeLinecap="round" /><Marker x={lx + 20} y={80} metric={panel.metric} /><text x={lx + 50} y={85} fontSize={16} fontWeight={600} fill="#17233b">{style.label}</text></g>;
    })}
    <text className="axis-title" x={left} y={top - 14} style={{fontSize:16,fontWeight:700,fill:"#5f6875"}}>Rétention (% de la valeur Unaged)</text>
    <defs><clipPath id={clipId}><rect x={left} y={top} width={pw} height={ph} /></clipPath></defs>
    {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map(value => <g key={value}><line className="grid-line" x1={left} x2={left + pw} y1={y(value)} y2={y(value)} stroke="#e8e5de" /><text className="axis-label" x={left - 12} y={y(value) + 4} textAnchor="end" style={{fontSize:14,fill:"#737b88"}}>{Number(value.toFixed(1))}</text></g>)}
    <line className="axis-line" x1={left} x2={left + pw} y1={top + ph} y2={top + ph} stroke="#9ca3af" strokeWidth={1.2} />
    {Array.from({ length: 6 }, (_, i) => end * i / 5).map((value, i) => <g key={i}><line className="tick-line" x1={x(value)} x2={x(value)} y1={top+ph} y2={top+ph+6} stroke="#9ca3af" /><text className="axis-label" x={x(value)} y={top + ph + 28} textAnchor="middle" style={{fontSize:14,fill:"#737b88"}}>{Number(value.toFixed(1))}</text></g>)}
    <text className="axis-title" x={left + pw} y={top + ph + 52} textAnchor="end" style={{fontSize:16,fontWeight:700,fill:"#5f6875"}}>{figureXAxisLabel(unit)}</text>
    <g clipPath={`url(#${clipId})`}>
      <g className="reference-baseline"><line x1={left} x2={left + pw} y1={y(100)} y2={y(100)} stroke="#737b88" strokeWidth={1.2} strokeDasharray="7 5" />{100>=min&&100<=max&&<text x={left+pw-4} y={y(100)-8} textAnchor="end" style={{fontSize:12,fontWeight:700,fill:"#5f6875"}}>Référence · 100 %</text>}</g>
      {panels.map(panel => {
        const cells = panel.cells.filter(cell => cell.sampleUid === sampleUid), style = styles[panel.metric];
        return <g key={panel.metric} aria-label={style.label}>{cells.map((cell, i) => {
          const previous = cells[i - 1];
          if (cell.value === null) return null;
          return <g key={cell.time}>
            {previous?.value != null && <line x1={x(previous.time)} x2={x(cell.time)} y1={y(previous.value)} y2={y(cell.value)} stroke={style.color} strokeWidth={3} strokeDasharray={style.dash} strokeLinecap="round" />}
            <g><title>{`${style.label} · ${cell.time} ${unit} : ${cell.value.toFixed(2)} % · valeur ${cell.trace?.absoluteValue}, référence ${cell.trace?.baseline?.value}`}</title><Marker x={x(cell.time)} y={y(cell.value)} metric={panel.metric} /></g>
          </g>;
        })}</g>;
      })}
    </g>
  </g>;
}

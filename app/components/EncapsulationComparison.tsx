"use client";

import { useRef } from "react";
import type { IVDataset } from "../lib/iv-data";
import { boxStatistics, encapsulationGroups } from "../lib/encapsulation";

export function EncapsulationComparison({ dataset, selections }: { dataset: IVDataset | null; selections: { material: string; color: string }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { groups, excluded } = encapsulationGroups(dataset?.samples ?? [], dataset?.observations ?? [], selections.map((item) => item.material));
  const missing = [...new Set(selections.map((item) => item.material))].filter((material) => !groups.some((group) => group.family === material));
  const values = groups.flatMap((group) => group.pairs.flatMap((pair) => [pair.before, pair.after]));
  const min = values.length ? Math.max(0, Math.floor(Math.min(...values)) - 1) : 0;
  const max = values.length ? Math.ceil(Math.max(...values)) + 1 : 1;
  const width = Math.max(680, groups.length * 210 + 100);
  const y = (value: number) => 340 - (value - min) / (max - min) * 240;
  const exportSvg = () => {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgRef.current)], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "encapsulation-before-after.svg";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="chart-card" style={{ padding: 24 }} aria-label="Before and after encapsulation">
    <div className="chart-title"><strong>Encapsulation · PCE (η) before / after</strong><button type="button" className="soft-button" disabled={!groups.length} onClick={exportSvg}>Export SVG</button></div>
    <p>Paired cells only, grouped by formulation and batch. Independent of ageing protocol, trend metric and trend sample filters. QA-flagged or ambiguous baselines are excluded.</p>
    <p>Source: Initial Eff → Unaged (before ageing). The exact interval around encapsulation is not documented. {excluded} selected-material cells excluded because a unique valid pair is unavailable.</p>
    {missing.length > 0 && <p role="status">No paired data for: {missing.join(" · ")}. Choose another encapsulant above.</p>}
    {groups.length > 0 && <>
      <div style={{ overflowX: "auto" }}>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={480} viewBox={`0 0 ${width} 480`} role="img" aria-label="PCE distributions before and after encapsulation, grouped by formulation and batch" style={{ background: "white", fontFamily: "Arial, sans-serif", color: "#222" }}>
          <rect width={width} height={480} fill="white" />
          <text x={width / 2} y={28} textAnchor="middle" fontSize={18} fontWeight="bold">PCE before / after encapsulation</text>
          <text x={width / 2} y={51} textAnchor="middle" fontSize={12}>Same cells at both stages · formulations and batches kept separate</text>
          <text x={20} y={220} transform="rotate(-90 20 220)" textAnchor="middle" fontSize={14}>PCE η (%)</text>
          {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map((value) => <g key={value}><line x1={65} x2={width - 20} y1={y(value)} y2={y(value)} stroke="#ddd" /><text x={55} y={y(value) + 4} textAnchor="end" fontSize={12}>{value.toFixed(1)}</text></g>)}
          {groups.map((group, index) => {
            const center = 100 + (index + 0.5) * (width - 120) / groups.length;
            const color = selections.find((item) => item.material === group.family)?.color ?? "#336699";
            return <g key={group.key}>
              {(["before", "after"] as const).map((stage, stageIndex) => {
                const x = center + (stageIndex ? 30 : -30);
                const box = boxStatistics(group.pairs.map((pair) => pair[stage]));
                return <g key={stage}>
                  {group.pairs.length >= 3 && <g stroke={color} fill={color} fillOpacity={stageIndex ? 0.4 : 0.12}>
                    <line x1={x} x2={x} y1={y(box.low)} y2={y(box.high)} />
                    {[box.low, box.high].map((value, i) => <line key={i} x1={x - 10} x2={x + 10} y1={y(value)} y2={y(value)} />)}
                    <rect x={x - 20} y={y(box.q3)} width={40} height={Math.max(1, y(box.q1) - y(box.q3))} />
                    <line x1={x - 20} x2={x + 20} y1={y(box.median)} y2={y(box.median)} strokeWidth={2} />
                  </g>}
                  {group.pairs.map((pair, i) => <circle key={pair.sampleUid} cx={x + ((i % 5) - 2) * 4} cy={y(pair[stage])} r={3.5} fill={stageIndex ? color : "white"} stroke={color}><title>{pair.reference}: {stage} {pair[stage]}%</title></circle>)}
                  <text x={x} y={363} textAnchor="middle" fontSize={12}>{stageIndex ? "After" : "Before"}</text>
                </g>;
              })}
              <text x={center} y={388} textAnchor="middle" fontSize={12} fontWeight="bold">{group.material}</text>
              <text x={center} y={407} textAnchor="middle" fontSize={12}>Batch {group.batch} · n={group.pairs.length}{group.electrode === "Cu" ? "" : ` · ${group.electrode}`}</text>
            </g>;
          })}
          <text x={width / 2} y={441} textAnchor="middle" fontSize={11}>Box: Q1–Q3; line: median; whiskers: within 1.5 × IQR; all measured points shown. Points only if n &lt; 3.</text>
          <text x={width / 2} y={461} textAnchor="middle" fontSize={11}>Source: Initial Eff → Unaged. Exact time interval around encapsulation not documented.</text>
        </svg>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Formulation / batch</th><th>Paired n</th><th>Mean before (%)</th><th>Mean after (%)</th><th>Mean paired Δη (percentage points)</th></tr></thead><tbody>{groups.map((group) => {
        const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
        return <tr key={group.key}><td>{group.material} / {group.batch}{group.electrode === "Cu" ? "" : ` / ${group.electrode}`}</td><td>{group.pairs.length}</td><td>{mean(group.pairs.map((pair) => pair.before)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after - pair.before)).toFixed(2)}</td></tr>;
      })}</tbody></table></div>
    </>}
  </section>;
}

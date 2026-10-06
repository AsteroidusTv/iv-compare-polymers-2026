"use client";
import { ExportMenu, CopyCaption } from "./ExportMenu";
import { useId, useMemo, useRef, useState } from 'react';
import { datasetPackageHash, type IVDataset } from '../lib/iv-data';
import { lightAgeingOverlay, type LightSweep } from '../lib/light-ageing-overlay';
import { buildIdentity } from '../lib/build-identity';
import { rowsCsv } from '../lib/tabular-export';
import { downloadFigureFile, downloadScientificGraphic } from '../lib/browser-figure-download';
import { InfoTip } from './InfoTip';
import type { LightAgeingMetricKey } from '../lib/light-ageing-metrics';
import { cellLabel, specimenLabel, readableReason } from '../lib/public-labels';

const sweepLabels = { mean: 'moyenne aller/retour', forward: 'balayage aller', reverse: 'balayage retour' };
type CellAnalysis = ReturnType<typeof lightAgeingOverlay>[number];

function MetricMarker({ stem, x, y, color }: { stem: string; x: number; y: number; color: string }) {
  const style = { fill: 'white', stroke: color, strokeWidth: 1.8 };
  if (stem === 'jsc') return <rect x={x - 3} y={y - 3} width={6} height={6} {...style}/>;
  if (stem === 'voc') return <path d={`M${x} ${y - 4}l4 7h-8Z`} {...style}/>;
  if (stem === 'ff') return <path d={`M${x} ${y - 4}l4 4l-4 4l-4 -4Z`} {...style}/>;
  return <circle cx={x} cy={y} r={3} {...style}/>;
}

function CellFigure({ analysis, dataset, cutoff, manual, yMin, yMax }: {
  analysis: CellAnalysis; dataset: IVDataset; cutoff: number | null; manual: boolean; yMin: number; yMax: number;
}) {
  const svg = useRef<SVGSVGElement>(null), clip = `light-overlay-${useId().replace(/:/g, '')}`;
  const [error, setError] = useState<string | null>(null);
  const { sample, panels, sweep } = analysis;
  const values = panels.flatMap(panel => panel.points.flatMap(point => point.value === null ? [] : [point.value]));
  const min = manual ? yMin : Math.floor(Math.min(100, ...values) / 5) * 5 - 5;
  const max = manual ? yMax : Math.ceil(Math.max(100, ...values) / 5) * 5 + 5;
  const end = cutoff ?? analysis.allTimes.at(-1) ?? 1;
  const width = 1180, height = 590, left = 85, top = 125, pw = 1035, ph = 390;
  const x = (time: number) => left + time / Math.max(end, 0.000001) * pw;
  const y = (value: number) => top + ph - (value - min) / (max - min) * ph;
  const title = 'Rétention de Pout, Jsc, Voc et FF — light ageing';
  const subtitle = [sample.material_family, sample.batch_no_raw && `Lot ${sample.batch_no_raw}`,
    cellLabel(sample).replace('Cell ', 'Cellule '), sample.electrode && `Électrode ${sample.electrode}`, sweepLabels[sweep]].filter(Boolean).join(' · ');
  const caption = `${title}. ${subtitle}. Temps écoulé en heures. Chaque grandeur est normalisée par sa première valeur enregistrée admissible pour cette cellule, après exclusions explicites d'irradiance ; aucun remplacement par une référence ultérieure. ${sweep === 'mean' ? 'Moyenne arithmétique (aller + retour) / 2 pour chaque grandeur sur la même ligne, avant normalisation ; les deux lectures sont requises. ' : ''}Pout est une puissance surfacique, pas une PCE. Contrôle qualité propre à chaque grandeur ; valeurs manquantes ou exclues interrompent les courbes. Aucune interpolation ni agrégation entre cellules.`;
  const rows = panels.flatMap(panel => panel.points.map(point => ({ sample_uid: sample.sample_uid, metric: panel.metric, sweep,
    time_h: point.time, retention_pct: point.value, absolute_value: point.trace?.absoluteValue,
    baseline_value: point.trace?.baseline?.value, baseline_status: point.trace?.baseline?.status,
    baseline_source_rows: point.trace?.baseline?.observations.map(row => ({file: row.source_file, row: row.source_row, time_h: row.exposure_duration_numeric})),
    source_file: point.trace?.observation.source_file, source_row: point.trace?.observation.source_row,
    forward_value: point.trace?.observation[`light_${panel.stem}_forward_${panel.suffix}` as LightAgeingMetricKey],
    reverse_value: point.trace?.observation[`light_${panel.stem}_reverse_${panel.suffix}` as LightAgeingMetricKey],
    exclusions: point.reasons, inside_viewport: point.value !== null && point.value >= min && point.value <= max })));
  const manifest = { schemaVersion: 'iv-compare-light-overlay/1', title, caption, sourceCode: buildIdentity,
    dataset: { name: dataset.name, packageSha256: datasetPackageHash(dataset), provenance: dataset.provenance },
    analysis: { sample, sweep, graphEnd: cutoff, allTimes: analysis.allTimes,
      policy: { qa: 'excluded', irradiation: 'mandatory source-bound exclusions', interpolation: 'none', aggregation: 'none',
        normalization: '100 * selected metric / same-cell first recorded metric after irradiation exclusions; no later reference substitution',
        mean: sweep === 'mean' ? '(forward + reverse) / 2 from same source row, before normalization' : null },
      panels: panels.map(panel => ({ metric: panel.metric, label: panel.label,
        baseline: panel.traces[0]?.baseline,
        fullSelectedRows: panel.traces.map(trace => ({time_h: trace.observation.exposure_duration_numeric,
          observation_uid: trace.observation.observation_uid, source_file: trace.observation.source_file, source_row: trace.observation.source_row,
          absolute_value: trace.absoluteValue, retention_pct: trace.value, exclusions: trace.exclusions, qa_reasons: trace.qaReasons,
          forward_value: trace.observation[`light_${panel.stem}_forward_${panel.suffix}` as LightAgeingMetricKey],
          reverse_value: trace.observation[`light_${panel.stem}_reverse_${panel.suffix}` as LightAgeingMetricKey]})) })) },
    analyticalRows: rows, display: { width, height, viewport: { xMin: 0, xMax: end, yMin: min, yMax: max }, manualY: manual } };
  const stem = `light-ageing-${sample.sample_uid}-${sweep}`;
  async function graphic(format: 'svg' | 'png', preset: 'default' | 'report' = 'default') {
    if (!svg.current) return;
    setError(null);
    try { await downloadScientificGraphic(svg.current, width, height, manifest, stem, format, preset); }
    catch (error) { setError(String(error)); }
  }
  return <article className="light-overlay-cell">
    <div className="trend-panel-head"><div><strong>{specimenLabel(sample)}</strong><span className="trend-panel-context">Four parameter retentions · {sweep === 'mean' ? 'paired forward / reverse mean' : `${sweep} sweep`}</span></div></div>
    <ExportMenu>
      <button onClick={() => void graphic('svg')}>Export SVG</button><button onClick={() => void graphic('png')}>Export PNG</button><button onClick={() => void graphic('svg', 'report')}>Report-ready SVG</button>
      <button onClick={() => downloadFigureFile(rowsCsv(rows), `${stem}.figure.csv`, 'text/csv')}>Figure data · CSV</button>
      <button onClick={() => downloadFigureFile(JSON.stringify(manifest, null, 2), `${stem}.figure.json`, 'application/json')}>Method & sources · JSON</button>
      <CopyCaption caption={caption} filename={`${stem}.caption.txt`}/>
    </ExportMenu>
    {error && <p role="alert">{error}</p>}
    {!values.length && <p role="status">No QA-valid normalized values for this cell. See missing values and references below.</p>}
    <svg ref={svg} className="light-overlay-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} · ${subtitle}`} style={{ background: 'white', fontFamily: 'Arial, sans-serif' }}>
      <rect width={width} height={height} fill="white"/><text x={32} y={28} fontSize={22} fontWeight={700} fill="#17233b">{title}</text><text x={32} y={52} fontSize={14} fill="#737b88">{subtitle}</text>
      {panels.map((panel, index) => <g key={panel.metric}><line x1={170 + index * 240} x2={210 + index * 240} y1={80} y2={80} stroke={panel.color} strokeWidth={3} strokeDasharray={panel.dash}/><MetricMarker stem={panel.stem} x={190 + index * 240} y={80} color={panel.color}/><text x={220 + index * 240} y={85} fontSize={16} fontWeight={600} fill="#17233b">{panel.label}</text></g>)}
      <text className="axis-title" x={left} y={111} fontSize={16} fill="#5f6875">Rétention (% de la valeur initiale)</text>
      <defs><clipPath id={clip}><rect x={left} y={top} width={pw} height={ph}/></clipPath></defs>
      {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map(value => <g key={value}><line className="grid-line" x1={left} x2={left + pw} y1={y(value)} y2={y(value)} stroke="#e8e5de"/><text className="axis-label" x={left - 12} y={y(value) + 4} textAnchor="end" fontSize={14} fill="#737b88">{Number(value.toFixed(1))}</text></g>)}
      <g clipPath={`url(#${clip})`}><line x1={left} x2={left + pw} y1={y(100)} y2={y(100)} stroke="#8c929b" strokeDasharray="5 5"/>
        {panels.map(panel => <g key={panel.metric}>{panel.points.map((point, i) => {
          if (point.value === null) return null;
          const prev = panel.points[i - 1];
          return <g key={point.time}>{prev?.value !== null && prev?.value !== undefined && <line x1={x(prev.time)} x2={x(point.time)} y1={y(prev.value)} y2={y(point.value)} stroke={panel.color} strokeWidth={2.5} strokeDasharray={panel.dash}/>}
            <title>{panel.label} · {point.time} h · {point.value.toFixed(2)} %</title>
            {(i % 8 === 0 || i === panel.points.length - 1 || prev?.value === null) && <MetricMarker stem={panel.stem} x={x(point.time)} y={y(point.value)} color={panel.color}/>}</g>;
        })}</g>)}
      </g>
      <line x1={left} x2={left + pw} y1={top + ph} y2={top + ph} stroke="#bdc4cd"/>
      {Array.from({ length: 6 }, (_, i) => end * i / 5).map((time, i) => <text className="axis-label" key={i} x={x(time)} y={top + ph + 25} textAnchor="middle" fontSize={14} fill="#737b88">{Number(time.toFixed(1))}</text>)}
      <text className="axis-title" x={left + pw} y={top + ph + 55} textAnchor="end" fontSize={16} fill="#5f6875">Temps de vieillissement (h)</text>
    </svg>
    <details><summary>Missing values, source rows and normalization references</summary><div className="table-scroll"><table><thead><tr><th>Metric</th><th>Time (h)</th><th>Retention (%)</th><th>Absolute</th><th>Initial reference</th><th>Source row</th><th>Exclusions</th></tr></thead><tbody>{panels.flatMap(panel => panel.points.map(point => <tr key={`${panel.metric}:${point.time}`}><td>{panel.label}</td><td>{point.time}</td><td>{point.value?.toFixed(2) ?? 'Missing'}</td><td>{point.trace?.absoluteValue ?? '—'}</td><td>{point.trace?.baseline?.value ?? '—'}</td><td>{point.trace?.observation.source_row ?? '—'}</td><td>{point.reasons.map(readableReason).join('; ') || 'observed'}</td></tr>))}</tbody></table></div></details>
  </article>;
}

export function LightAgeingOverlay({ dataset, sampleUids }: { dataset: IVDataset; sampleUids: string[] }) {
  const [open, setOpen] = useState(false), [sweep, setSweep] = useState<LightSweep>('mean');
  const [cutoff, setCutoff] = useState<number | null>(null), [manual, setManual] = useState(false);
  const [yMin, setYMin] = useState(0), [yMax, setYMax] = useState(120);
  const analysis = useMemo(() => open ? lightAgeingOverlay(dataset, sampleUids, sweep, cutoff) : [], [open, dataset, sampleUids, sweep, cutoff]);
  const validManual = Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin;
  return <section className="chart-card light-overlay-section" aria-label="Light-ageing parameter comparison">
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Compare Pout, Jsc, Voc and FF · one figure per cell <InfoTip text="Same-cell parameter retentions share one axis. Each metric uses its own initial reference. One common sweep selection; never pooled across cells. Pout is not PCE. This diagnostic always excludes QA flags and different-irradiance measurements, independently of the main graph settings."/></summary>
      {open && <>
        <p className="muted">Light ageing · selected cells from the comparison series · retention only · QA-flagged values excluded. Missing values interrupt curves.</p>
        <div className="graph-layout-controls">
          <label>Sweep<select aria-label="Parameter comparison sweep" value={sweep} onChange={event => setSweep(event.target.value as LightSweep)}><option value="mean">Mean forward / reverse</option><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label>
          <label>Graph end (h)<input aria-label="Parameter comparison graph end" type="number" min={0} value={cutoff ?? ''} placeholder="All observed times" onChange={event => setCutoff(event.target.value === '' ? null : Math.max(0, Number(event.target.value)))}/></label><button className="soft-button" onClick={() => setCutoff(null)}>All observed times</button>
          <label><input type="checkbox" checked={manual} onChange={event => setManual(event.target.checked)}/> Manual Y scale</label>
          {manual && <><label>Y minimum<input type="number" value={yMin} onChange={event => setYMin(Number(event.target.value))}/></label><label>Y maximum<input type="number" value={yMax} onChange={event => setYMax(Number(event.target.value))}/></label></>}
        </div>
        {manual && !validManual && <p role="alert">Y maximum must exceed Y minimum. Automatic scale remains active.</p>}
        {!analysis.length && <p role="status">No light-ageing cells match the selected series and filters.</p>}
        {analysis.map(cell => <CellFigure key={cell.sample.sample_uid} analysis={cell} dataset={dataset} cutoff={cutoff} manual={manual && validManual} yMin={yMin} yMax={yMax}/>)}
      </>}
    </details>
  </section>;
}

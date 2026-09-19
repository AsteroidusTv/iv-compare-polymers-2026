"use client";

import { useRef, useState } from "react";
import type { CurveSeries } from "./Charts";
import { CurveChart } from "./Charts";
import type { EncapsulationCurvePair, EncapsulationGroup } from "../lib/encapsulation";
import { boxStatistics, encapsulationCurvePairs, encapsulationGroups, meanPairedRelativeChange, pairedMeasurementDayRange } from "../lib/encapsulation";
import { pointOffsets } from "../lib/encapsulation-layout";
import type { IVDataset, Measurement } from "../lib/iv-data";
import { getJVDiagnostics } from "../lib/jv-science";
import { numeric } from "../lib/science";
import { InfoTip } from "./InfoTip";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : value;
}

function dateRange(values: string[]) {
  const dates = [...new Set(values)].sort();
  if (!dates.length) return "—";
  if (dates.length === 1) return formatDate(dates[0]);
  return `${formatDate(dates[0])}–${formatDate(dates[dates.length - 1])}`;
}

function elapsedDays(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const milliseconds = Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(milliseconds) ? Math.round(milliseconds / 86_400_000) : null;
}

function groupProcessLabel(group: EncapsulationGroup, dataset: IVDataset | null) {
  const recordedLaminator = group.recipeUid ? dataset?.recipes.find((recipe) => recipe.recipe_uid === group.recipeUid)?.laminator : null;
  const laminator = recordedLaminator && recordedLaminator.toLowerCase() !== "unspecified" ? recordedLaminator : null;
  return [group.recipe, laminator].filter(Boolean).join(" · ") || "Process not recorded";
}

function processOrder(recipe: string | null | undefined) {
  return recipe?.toLowerCase().includes("sl") ? 1 : 0;
}

function metricValue(measurement: Measurement, key: "efficiency_pct" | "jsc_mA_cm2" | "voc_V" | "ff_pct") {
  const value = measurement[key];
  return numeric(value) ? value : null;
}

function makeCurveSeries(pair: EncapsulationCurvePair, dataset: IVDataset, color: string): CurveSeries[] {
  return [
    { measurement: pair.beforeMeasurement, label: `Before · ${formatDate(pair.beforeFile.measurement_date)}`, linePattern: "8 5" },
    { measurement: pair.afterMeasurement, label: `After · ${formatDate(pair.afterMeasurement.measurement_date)}`, linePattern: undefined },
  ].map(({ measurement, label, linePattern }) => {
    const analysis = getJVDiagnostics(dataset).get(measurement.measurement_uid)!.analysis;
    const primary = analysis.segments[analysis.primaryIndex];
    const operatingPoints = primary?.points.filter((point) => point.x >= -0.02 && (!numeric(measurement.voc_V) || point.x <= measurement.voc_V + 0.03)) ?? [];
    const displayedPoints = operatingPoints.length >= 3 ? operatingPoints : primary?.points ?? [];
    return {
      id: measurement.measurement_uid,
      label,
      color,
      linePattern,
      segments: primary ? [{
        id: `${measurement.measurement_uid}-${primary.id}`,
        isPrimary: true,
        points: displayedPoints.map((point) => ({ x: point.x, y: point.y, sourceIndex: point.sourceIndex })),
      }] : [],
    };
  });
}

function EncapsulationJVComparison({ dataset, pairs, selections }: { dataset: IVDataset; pairs: EncapsulationCurvePair[]; selections: { material: string; color: string }[] }) {
  const [requestedSampleUid, setRequestedSampleUid] = useState<string | null>(null);
  const diagnostics = getJVDiagnostics(dataset);
  // The inventory pairing and its date coverage remain independent of JV eligibility.
  pairs = pairs.filter(pair => diagnostics.get(pair.beforeMeasurement.measurement_uid)?.quantitativeEligible && diagnostics.get(pair.afterMeasurement.measurement_uid)?.quantitativeEligible);
  const pair = pairs.find((item) => item.sample.sample_uid === requestedSampleUid) ?? pairs[0] ?? null;
  if (!pair) return <section className="chart-card encapsulation-jv"><div className="chart-title"><strong>JV diagnostic · before / after encapsulation</strong></div><div className="missing-selection"><strong>No unambiguous raw JV pair</strong><span>The distribution chart remains available, but no QA-valid before/after curve pair can be linked to the selected materials.</span></div></section>;
  const color = selections.find((item) => item.material === pair.sample.material_family)?.color ?? "#3469d4";
  const series = makeCurveSeries(pair, dataset, color);
  const metrics = [
    ["PCE", "efficiency_pct", "%", 2],
    ["Jsc", "jsc_mA_cm2", "mA/cm²", 2],
    ["Voc", "voc_V", "V", 3],
    ["Fill factor", "ff_pct", "%", 2],
  ] as const;
  const recipe = pair.sample.recipe_raw || "Process not recorded";
  const postDays = elapsedDays(pair.sample.encapsulation_date, pair.afterMeasurement.measurement_date);
  const diagnosticGroups = [...pairs.reduce((groups, item) => {
    const key = JSON.stringify([item.sample.material_family, item.sample.material_raw, item.sample.batch_no_raw, item.sample.recipe_uid, item.sample.recipe_raw]);
    const group = groups.get(key) ?? { key, material: item.sample.material_raw || item.sample.material_family, batch: item.sample.batch_no_raw || "—", recipe: item.sample.recipe_raw || "Process not recorded", pairs: [] as EncapsulationCurvePair[] };
    group.pairs.push(item);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; material: string; batch: string; recipe: string; pairs: EncapsulationCurvePair[] }>()).values()];
  const diagnosticHelp = `Measured JV curves from the same physical cell are compared before and after encapsulation. At each stage, the QA-valid raw sweep closest to the independently recorded PCE is used. Exact sweep IDs: ${pair.beforeMeasurement.measurement_uid} → ${pair.afterMeasurement.measurement_uid}. This is a mechanism-screening view, not an isolated causal estimate of the process.`;
  return <section className="chart-card encapsulation-jv" aria-label="JV comparison before and after encapsulation">
    <div className="chart-title"><div className="trend-panel-title"><strong>JV diagnostic · same cell before / after encapsulation</strong><InfoTip text={diagnosticHelp} align="left" /></div></div>
    <div className="encapsulation-jv-controls">
      <label>Physical cell<select value={pair.sample.sample_uid} onChange={(event) => setRequestedSampleUid(event.target.value)}>{pairs.map((item) => <option value={item.sample.sample_uid} key={item.sample.sample_uid}>{item.sample.material_raw || item.sample.material_family} · batch {item.sample.batch_no_raw || "—"} · {item.sample.sample_id_raw || item.sample.sample_uid} · {item.sample.recipe_raw || "process n/a"}</option>)}</select></label>
      <div><b>{pair.sample.material_raw || pair.sample.material_family}</b><span>Batch {pair.sample.batch_no_raw || "—"} · {recipe}{pair.sample.electrode && pair.sample.electrode !== "Cu" ? ` · ${pair.sample.electrode}` : ""}</span></div>
      <div><b>{formatDate(pair.beforeFile.measurement_date)} → {formatDate(pair.sample.encapsulation_date)} → {formatDate(pair.afterMeasurement.measurement_date)}</b><span>Before measurement · encapsulation · after measurement{postDays === null ? "" : ` · ${postDays} d after encapsulation`}</span></div>
    </div>
    <div className="chart-title encapsulation-jv-legend">{series.map((item) => <span key={item.id}><svg className="legend-stroke" viewBox="0 0 24 8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" stroke={item.color} strokeWidth="3" strokeDasharray={item.linePattern} /></svg>{item.label}</span>)}</div>
    <CurveChart series={series} yAxisLabel="Generated J (mA/cm²)" currentConvention="pv" showPoints={false} showLandmarks scaleMode="primary" />
    <div className="table-scroll"><table><thead><tr><th>Metric</th><th>Before sweep</th><th>After sweep</th><th>Δ after − before</th></tr></thead><tbody>{metrics.map(([label, key, unit, digits]) => {
      const before = metricValue(pair.beforeMeasurement, key);
      const after = metricValue(pair.afterMeasurement, key);
      return <tr key={key}><td>{label}</td><td>{before === null ? "—" : `${before.toFixed(digits)} ${unit}`}</td><td>{after === null ? "—" : `${after.toFixed(digits)} ${unit}`}</td><td>{before === null || after === null ? "—" : `${after - before >= 0 ? "+" : ""}${(after - before).toFixed(digits)} ${unit}`}</td></tr>;
    })}</tbody></table></div>
    <div className="encapsulation-diagnostic-head"><strong>Campaign-level JV diagnostic</strong><span>Mean paired changes from the representative raw sweeps</span></div>
    <div className="table-scroll"><table><thead><tr><th>Formulation / batch</th><th>Recorded process</th><th>Raw JV pairs</th><th>Mean ΔPCE (pp)</th><th>Mean ΔJsc (mA/cm²)</th><th>Mean ΔVoc (V)</th><th>Mean ΔFF (pp)</th></tr></thead><tbody>{diagnosticGroups.map((group) => {
      const delta = (key: "efficiency_pct" | "jsc_mA_cm2" | "voc_V" | "ff_pct") => mean(group.pairs.map((item) => (item.afterMeasurement[key] as number) - (item.beforeMeasurement[key] as number)));
      return <tr key={group.key}><td>{group.material} / {group.batch}</td><td>{group.recipe}</td><td>{group.pairs.length}</td><td>{delta("efficiency_pct").toFixed(2)}</td><td>{delta("jsc_mA_cm2").toFixed(2)}</td><td>{delta("voc_V").toFixed(3)}</td><td>{delta("ff_pct").toFixed(2)}</td></tr>;
    })}</tbody></table></div>
  </section>;
}

export function EncapsulationComparison({ dataset, selections }: { dataset: IVDataset | null; selections: { material: string; color: string }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hiddenGroupKeys, setHiddenGroupKeys] = useState<Set<string>>(() => new Set());
  const [showMeasurementInterval, setShowMeasurementInterval] = useState(false);
  const selectedMaterials = selections.map((item) => item.material);
  const { groups: availableGroups, excluded } = encapsulationGroups(dataset?.samples ?? [], dataset?.observations ?? [], selectedMaterials, dataset?.files ?? []);
  availableGroups.sort((a, b) => selections.findIndex((item) => item.material === a.family) - selections.findIndex((item) => item.material === b.family) || a.material.localeCompare(b.material) || a.batch.localeCompare(b.batch, "en", { numeric: true }) || processOrder(a.recipe) - processOrder(b.recipe) || (a.recipe || "").localeCompare(b.recipe || "") || a.electrode.localeCompare(b.electrode));
  const groups = availableGroups.filter((group) => !hiddenGroupKeys.has(group.key));
  const missing = [...new Set(selectedMaterials)].filter((material) => !availableGroups.some((group) => group.family === material));
  const values = groups.flatMap((group) => group.pairs.flatMap((pair) => [pair.before, pair.after]));
  const min = values.length ? Math.max(0, Math.floor(Math.min(...values)) - 1) : 0;
  const max = values.length ? Math.ceil(Math.max(...values)) + 1 : 1;
  const width = Math.max(720, groups.length * 230 + 100);
  const height = showMeasurementInterval ? 456 : 435;
  const y = (value: number) => 300 - (value - min) / (max - min) * 240;
  const visibleSampleUids = new Set(groups.flatMap((group) => group.pairs.map((pair) => pair.sampleUid)));
  const rawCurvePairs = dataset ? encapsulationCurvePairs(dataset).filter((pair) => selectedMaterials.includes(pair.sample.material_family) && visibleSampleUids.has(pair.sample.sample_uid)).sort((a, b) => a.sample.material_family.localeCompare(b.sample.material_family) || (a.sample.batch_no_raw || "").localeCompare(b.sample.batch_no_raw || "", "en", { numeric: true }) || processOrder(a.sample.recipe_raw) - processOrder(b.sample.recipe_raw) || (a.sample.recipe_raw || "").localeCompare(b.sample.recipe_raw || "") || (a.sample.sample_id_raw || "").localeCompare(b.sample.sample_id_raw || "", "en", { numeric: true })) : [];
  const toggleGroup = (key: string) => setHiddenGroupKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const exportSvg = () => {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgRef.current)], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "encapsulation-before-after.svg";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const summaryHelp = `The same physical cells are paired before encapsulation and after encapsulation, before ageing. Open points are before; filled points are after; thin lines connect the same cell. Boxes span Q1–Q3, with the median and 1.5 × IQR whiskers. Formulation, batch and distinct recorded processes remain separate. QA-flagged or ambiguous pairs are excluded. Dates come from linked raw JV files when available. ${excluded} selected-material cells have no unique valid PCE pair.`;
  return <div className="encapsulation-workspace">
    <section className="chart-card encapsulation-summary" aria-label="Before and after encapsulation">
      <div className="chart-title"><div className="trend-panel-title"><strong>Encapsulation · PCE (η) before / after</strong><InfoTip text={summaryHelp} align="left" /></div><button type="button" className="soft-button" disabled={!groups.length} onClick={exportSvg}>Export SVG</button></div>
      {missing.length > 0 && <p role="status">No paired data for: {missing.join(" · ")}. Choose another encapsulant above.</p>}
      {availableGroups.length > 0 && <fieldset className="encapsulation-group-filter">
        <legend>Displayed batches <InfoTip text="Hide a formulation/batch group from the PCE chart, summary table, SVG export and JV diagnostic. The source data remain unchanged." align="left" /></legend>
        <div>{availableGroups.map((group) => {
          const showProcess = availableGroups.some((candidate) => candidate.key !== group.key && candidate.material === group.material && candidate.batch === group.batch && candidate.electrode === group.electrode);
          return <label key={group.key}>
            <input type="checkbox" checked={!hiddenGroupKeys.has(group.key)} onChange={() => toggleGroup(group.key)} />
            <span>{group.material} · batch {group.batch}{showProcess ? ` · ${groupProcessLabel(group, dataset)}` : ""} · n={group.pairs.length}</span>
          </label>;
        })}</div>
        {groups.length < availableGroups.length && <button type="button" className="soft-button" onClick={() => setHiddenGroupKeys(new Set())}>Show all</button>}
      </fieldset>}
      {availableGroups.length > 0 && <label className="encapsulation-interval-toggle"><input type="checkbox" checked={showMeasurementInterval} onChange={(event) => setShowMeasurementInterval(event.target.checked)} /> Show before→after interval in chart and SVG</label>}
      {availableGroups.length > 0 && groups.length === 0 && <div className="missing-selection"><strong>No batch displayed</strong><span>Select at least one batch above to restore the chart.</span></div>}
      {groups.length > 0 && <>
        <div style={{ overflowX: "auto" }}>
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Paired PCE before and after encapsulation, grouped by formulation, batch and lamination recipe" style={{ background: "white", fontFamily: "Arial, sans-serif", color: "#222" }}>
            <rect width={width} height={height} fill="white" />
            <text x={width / 2} y={28} textAnchor="middle" fontSize={18} fontWeight="bold">PCE before / after encapsulation</text>
            <text x={20} y={180} transform="rotate(-90 20 180)" textAnchor="middle" fontSize={14}>PCE η (%)</text>
            {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map((value) => <g key={value}><line x1={65} x2={width - 20} y1={y(value)} y2={y(value)} stroke="#ddd" /><text x={55} y={y(value) + 4} textAnchor="end" fontSize={12}>{value.toFixed(1)}</text></g>)}
            {groups.map((group, index) => {
              const center = 100 + (index + 0.5) * (width - 120) / groups.length;
              const color = selections.find((item) => item.material === group.family)?.color ?? "#336699";
              const showProcess = groups.some((candidate) => candidate.key !== group.key && candidate.material === group.material && candidate.batch === group.batch && candidate.electrode === group.electrode);
              const relativeChange = meanPairedRelativeChange(group.pairs);
              const dayRange = pairedMeasurementDayRange(group.pairs);
              const dayLabel = dayRange === null ? "—" : dayRange.min === dayRange.max ? `${dayRange.min} d` : `${dayRange.min}–${dayRange.max} d`;
              const beforeOffsets = pointOffsets(group.pairs.map((pair) => y(pair.before)));
              const afterOffsets = pointOffsets(group.pairs.map((pair) => y(pair.after)));
              return <g key={group.key}>
                {group.pairs.map((pair, pairIndex) => <line key={`pair-${pair.sampleUid}`} x1={center - 36 + beforeOffsets[pairIndex]} x2={center + 36 + afterOffsets[pairIndex]} y1={y(pair.before)} y2={y(pair.after)} stroke={color} strokeWidth={1.2} opacity={0.42}><title>{pair.reference}: {pair.before}% → {pair.after}%</title></line>)}
                {(["before", "after"] as const).map((stage, stageIndex) => {
                  const x = center + (stageIndex ? 36 : -36);
                  const offsets = stageIndex ? afterOffsets : beforeOffsets;
                  const box = boxStatistics(group.pairs.map((pair) => pair[stage]));
                  return <g key={stage}>
                    {group.pairs.length >= 3 && <g stroke={color} fill={color} fillOpacity={stageIndex ? 0.4 : 0.12}>
                      <line x1={x} x2={x} y1={y(box.low)} y2={y(box.high)} />
                      {[box.low, box.high].map((value, i) => <line key={i} x1={x - 10} x2={x + 10} y1={y(value)} y2={y(value)} />)}
                      <rect x={x - 20} y={y(box.q3)} width={40} height={Math.max(1, y(box.q1) - y(box.q3))} />
                      <line x1={x - 20} x2={x + 20} y1={y(box.median)} y2={y(box.median)} strokeWidth={2} />
                    </g>}
                    {group.pairs.map((pair, i) => <circle key={pair.sampleUid} cx={x + offsets[i]} cy={y(pair[stage])} r={3.5} fill={stageIndex ? color : "white"} stroke={color}><title>{pair.reference}: {stage} {pair[stage]}%</title></circle>)}
                    <text x={x} y={323} textAnchor="middle" fontSize={12}>{stageIndex ? "After" : "Before"}</text>
                  </g>;
                })}
                <text x={center} y={348} textAnchor="middle" fontSize={12} fontWeight="bold">{group.material}</text>
                {showProcess && <text x={center} y={369} textAnchor="middle" fontSize={11}>{groupProcessLabel(group, dataset)}</text>}
                <text x={center} y={showProcess ? 390 : 371} textAnchor="middle" fontSize={11}>Batch {group.batch} · n={group.pairs.length}{group.electrode === "Cu" ? "" : ` · ${group.electrode}`}</text>
                <text x={center} y={showProcess ? 411 : 392} textAnchor="middle" fontSize={11} fill="#5f6875">Mean ΔPCErel {relativeChange === null ? "—" : `${relativeChange >= 0 ? "+" : ""}${relativeChange.toFixed(1)}%`}</text>
                {showMeasurementInterval && <text x={center} y={showProcess ? 432 : 413} textAnchor="middle" fontSize={11} fill="#5f6875">Before→after {dayLabel}</text>}
              </g>;
            })}
          </svg>
        </div>
        <div className="table-scroll"><table><thead><tr><th>Formulation / batch</th><th>Recorded process</th><th>Paired n</th><th>Mean before (%)</th><th>Mean after (%)</th><th>Mean paired Δη (pp)</th><th>Mean paired ΔPCErel (%) <InfoTip text="Mean of the relative PCE change calculated separately for each paired cell: (after − before) / before × 100%." align="right" /></th><th>Measurement timeline <InfoTip text="Before measurement → encapsulation → after measurement. Dates appear only when the raw files link unambiguously to the same physical cell." align="right" /></th></tr></thead><tbody>{groups.map((group) => {
          const beforeDates = group.pairs.map((pair) => pair.beforeMeasurementDate).filter((value): value is string => Boolean(value));
          const encapsulationDates = group.pairs.map((pair) => pair.encapsulationDate).filter((value): value is string => Boolean(value));
          const afterDates = group.pairs.flatMap((pair) => pair.afterMeasurementDates);
          const relativeChange = meanPairedRelativeChange(group.pairs);
          return <tr key={group.key}><td>{group.material} / {group.batch}{group.electrode === "Cu" ? "" : ` / ${group.electrode}`}</td><td>{groupProcessLabel(group, dataset)}</td><td>{group.pairs.length}</td><td>{mean(group.pairs.map((pair) => pair.before)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after - pair.before)).toFixed(2)}</td><td>{relativeChange === null ? "—" : relativeChange.toFixed(2)}</td><td>{dateRange(beforeDates)} → {dateRange(encapsulationDates)} → {dateRange(afterDates)}</td></tr>;
        })}</tbody></table></div>
      </>}
    </section>
    {dataset ? <EncapsulationJVComparison dataset={dataset} pairs={rawCurvePairs} selections={selections} /> : null}
  </div>;
}

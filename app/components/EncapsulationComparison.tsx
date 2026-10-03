"use client";
import { figureFormulationLabel } from "../lib/figure-language";

import { useRef, useState } from "react";
import { useWorkspaceState, useWorkspaceSet } from "../lib/use-workspace-state";
import type { CurveSeries } from "./Charts";
import { CurveChart } from "./Charts";
import type { EncapsulationCurvePair } from "../lib/encapsulation";
import { boxStatistics, encapsulationCurvePairs, encapsulationDisplayLabels, encapsulationGroups, meanPairedRelativeChange, pairedChanges, pairedMeasurementDayRange } from "../lib/encapsulation";
import { pointOffsets } from "../lib/encapsulation-layout";
import { datasetPackageHash, type IVDataset, type Measurement } from "../lib/iv-data";
import { getJVDiagnostics } from "../lib/jv-science";
import { pairedFigureCsv, pairedFigureManifest } from "../lib/paired-export";
import { downloadFigureFile, downloadScientificGraphic } from "../lib/browser-figure-download";
import { buildIdentity } from "../lib/build-identity";
import { numeric } from "../lib/science";
import { InfoTip } from "./InfoTip";
import { StagedAgeing } from "./StagedAgeing";
import { SynchronizedMetrics } from "./SynchronizedMetrics";
import { fullJVSelectionCsv } from "../lib/jv-full-export";
import { figureStageLabel } from "../lib/figure-language";
import { recordedRibbon, ribbonLabel } from "../lib/ribbon";

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

function processOrder(recipe: string | null | undefined) {
  return recipe?.toLowerCase().includes("sl") ? 1 : 0;
}

function metricValue(measurement: Measurement, key: "efficiency_pct" | "jsc_mA_cm2" | "voc_V" | "ff_pct") {
  const value = measurement[key];
  return numeric(value) ? value : null;
}

function makeCurveSeries(pair: EncapsulationCurvePair, dataset: IVDataset, color: string): CurveSeries[] {
  return [
    { measurement: pair.beforeMeasurement, label: `Avant · ${formatDate(pair.beforeFile.measurement_date)}`, linePattern: "8 5" },
    { measurement: pair.afterMeasurement, label: `Après · ${formatDate(pair.afterMeasurement.measurement_date)}`, linePattern: undefined },
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

function EncapsulationJVComparison({ dataset, pairs, selections, splitByRibbon }: { dataset: IVDataset; pairs: EncapsulationCurvePair[]; selections: { material: string; color: string }[]; splitByRibbon: boolean }) {
  const [requestedSampleUid, setRequestedSampleUid] = useState<string | null>(null);
  const [inspectUnresolved, setInspectUnresolved] = useState(false);
  const inspectionControl = <label className="check-control"><input type="checkbox" checked={inspectUnresolved} onChange={event => setInspectUnresolved(event.target.checked)} /> Include JV pairs failing screening</label>;
  const diagnostics = getJVDiagnostics(dataset);
  // The inventory pairing and its date coverage remain independent of JV eligibility.
  pairs = pairs.filter(pair => inspectUnresolved || (diagnostics.get(pair.beforeMeasurement.measurement_uid)?.screeningEligible && diagnostics.get(pair.afterMeasurement.measurement_uid)?.screeningEligible));
  const pair = pairs.find((item) => item.sample.sample_uid === requestedSampleUid) ?? pairs[0] ?? null;
  if (!pair) return <section className="chart-card encapsulation-jv"><div className="chart-title"><strong>JV diagnostic · before / after encapsulation</strong></div><div className="missing-selection">{inspectionControl}<strong>No JV pair passes the numerical screening</strong><span>The PCE distribution remains available. Raw pairs can still be inspected explicitly.</span></div></section>;
  const color = selections.find((item) => item.material === pair.sample.material_family)?.color ?? "#3469d4";
  const series = makeCurveSeries(pair, dataset, color);
  const metrics = [
    ["PCE", "efficiency_pct", "%", 2],
    ["Jsc", "jsc_mA_cm2", "mA/cm²", 2],
    ["Voc", "voc_V", "V", 3],
    ["Fill factor", "ff_pct", "%", 2],
  ] as const;
  const postDays = elapsedDays(pair.sample.encapsulation_date, pair.afterMeasurement.measurement_date);
  const diagnosticGroups = [...pairs.reduce((groups, item) => {
    const ribbon = recordedRibbon(item.sample);
    const key = JSON.stringify([item.sample.material_family, item.sample.material_raw, item.sample.batch_no_raw, item.sample.electrode, item.sample.recipe_uid, item.sample.recipe_raw, ...(splitByRibbon ? [ribbon] : [])]);
    const group = groups.get(key) ?? { key, material: figureFormulationLabel(item.sample), batch: item.sample.batch_no_raw || "—", electrode: item.sample.electrode || "Unknown", recipeUid: item.sample.recipe_uid || null, ribbon: splitByRibbon ? ribbon : null, pairs: [] as EncapsulationCurvePair[] };
    group.pairs.push(item);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; material: string; batch: string; electrode: string; recipeUid: string | null; ribbon: string | null; pairs: EncapsulationCurvePair[] }>()).values()];
  const diagnosticLabels = encapsulationDisplayLabels(diagnosticGroups, dataset.recipes);
  const diagnosticHelp = `Measured JV curves from the same physical cell are compared before and after encapsulation. At each stage, the QA-valid raw sweep closest to the independently recorded PCE is used. Exact sweep IDs: ${pair.beforeMeasurement.measurement_uid} → ${pair.afterMeasurement.measurement_uid}. This is a mechanism-screening view, not an isolated causal estimate of the process.`;
  return <section className="chart-card encapsulation-jv" aria-label="JV comparison before and after encapsulation">
    <div className="chart-title"><div className="trend-panel-title"><strong>JV diagnostic · same cell before / after encapsulation</strong><InfoTip text={diagnosticHelp} align="left" /></div></div>
    <div className="jv-action-bar">
      {inspectionControl}
      <button type="button" className="soft-button" onClick={()=>downloadFigureFile(fullJVSelectionCsv(dataset,dataset.measurements.filter(measurement=>measurement.file_uid===pair.beforeFile.file_uid||measurement.file_uid===pair.afterMeasurement.file_uid).map(measurement=>measurement.measurement_uid)),"paired-jv.full-selected.csv","text/csv")}>Full selected JV dataset CSV</button>
    </div>
    <p role="status">{inspectUnresolved ? "Inspection mode includes curves with incomplete or inconsistent diagnostics." : "Displayed pairs pass automated branch and numerical-consistency screening. Instrument calibration and experimental validation remain to be documented."}</p>
    <div className="encapsulation-jv-controls">
      <label>Physical cell<select value={pair.sample.sample_uid} onChange={(event) => setRequestedSampleUid(event.target.value)}>{pairs.map((item) => <option value={item.sample.sample_uid} key={item.sample.sample_uid}>{figureFormulationLabel(item.sample)} · batch {item.sample.batch_no_raw || "—"} · {item.sample.sample_id_raw || item.sample.sample_uid}</option>)}</select></label>
      <div><b>{figureFormulationLabel(pair.sample)}</b><span>Batch {pair.sample.batch_no_raw || "—"}{pair.sample.electrode && pair.sample.electrode !== "Cu" ? ` · ${pair.sample.electrode}` : ""}</span></div>
      <div><b>{formatDate(pair.beforeFile.measurement_date)} → {formatDate(pair.sample.encapsulation_date)} → {formatDate(pair.afterMeasurement.measurement_date)}</b><span>Before measurement · encapsulation · after measurement{postDays === null ? "" : ` · ${postDays} d after encapsulation`}</span></div>
    </div>
    <div className="chart-title encapsulation-jv-legend">{series.map((item) => <span key={item.id}><svg className="legend-stroke" viewBox="0 0 24 8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" stroke={item.color} strokeWidth="3" strokeDasharray={item.linePattern} /></svg>{item.label}</span>)}</div>
    <CurveChart series={series} yAxisLabel="J généré (mA/cm²)" currentConvention="pv" showPoints={false} showLandmarks scaleMode="primary" exportContext={{ dataset: { name: dataset.name, packageSha256: datasetPackageHash(dataset), provenance: dataset.provenance }, sourceCode: buildIdentity, selectedSamples: [pair.sample], analysisType: "paired-jv-inspection", qa: { inspectUnresolved }, validation: { screeningEligible: [pair.beforeMeasurement, pair.afterMeasurement].every(m => diagnostics.get(m.measurement_uid)?.screeningEligible), quantitativeValidated: [pair.beforeMeasurement, pair.afterMeasurement].every(m => diagnostics.get(m.measurement_uid)?.quantitativeEligible) }, seriesMetadata: Object.fromEntries([pair.beforeMeasurement, pair.afterMeasurement].map(m => [m.measurement_uid, { measurement: m, file: dataset.files.find(file => file.file_uid === m.file_uid), diagnostics: diagnostics.get(m.measurement_uid) }])) }} />
    <div className="table-scroll"><table><thead><tr><th>Metric</th><th>Before sweep</th><th>After sweep</th><th>Δ after − before</th></tr></thead><tbody>{metrics.map(([label, key, unit, digits]) => {
      const before = metricValue(pair.beforeMeasurement, key);
      const after = metricValue(pair.afterMeasurement, key);
      return <tr key={key}><td>{label}</td><td>{before === null ? "—" : `${before.toFixed(digits)} ${unit}`}</td><td>{after === null ? "—" : `${after.toFixed(digits)} ${unit}`}</td><td>{before === null || after === null ? "—" : `${after - before >= 0 ? "+" : ""}${(after - before).toFixed(digits)} ${unit}`}</td></tr>;
    })}</tbody></table></div>
    <div className="encapsulation-diagnostic-head"><strong>Campaign-level JV diagnostic</strong><span>Mean paired changes from the representative raw sweeps</span></div>
    <div className="table-scroll"><table><thead><tr><th>Formulation / batch</th><th>Raw JV pairs</th><th>Mean ΔPCE (pp)</th><th>Mean ΔJsc (mA/cm²)</th><th>Mean ΔVoc (V)</th><th>Mean ΔFF (pp)</th></tr></thead><tbody>{diagnosticGroups.map((group) => {
      const delta = (key: "efficiency_pct" | "jsc_mA_cm2" | "voc_V" | "ff_pct") => mean(group.pairs.map((item) => (item.afterMeasurement[key] as number) - (item.beforeMeasurement[key] as number)));
      return <tr key={group.key}><td>{group.material} / {group.batch}{diagnosticLabels.get(group.key) ? ` / ${diagnosticLabels.get(group.key)}` : ""}{splitByRibbon ? ` / ${ribbonLabel(group.ribbon)}` : ""}</td><td>{group.pairs.length}</td><td>{delta("efficiency_pct").toFixed(2)}</td><td>{delta("jsc_mA_cm2").toFixed(2)}</td><td>{delta("voc_V").toFixed(3)}</td><td>{delta("ff_pct").toFixed(2)}</td></tr>;
    })}</tbody></table></div>
  </section>;
}

export function EncapsulationComparison({ dataset, selections, ribbonSampleIds, ribbonSelection, splitByRibbon }: { dataset: IVDataset | null; selections: { material: string; color: string }[]; ribbonSampleIds: ReadonlySet<string>; ribbonSelection: string; splitByRibbon: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hiddenGroupKeys, setHiddenGroupKeys] = useWorkspaceSet("encapsulation:hidden");
  const [excludedGroupKeys, setExcludedGroupKeys] = useWorkspaceSet("encapsulation:excluded");
  const [exportError, setExportError] = useState<string | null>(null);
  const [deltaSummary, setDeltaSummary] = useWorkspaceState<"mean" | "median" | "none">("encapsulation:delta", "median", value => ["mean", "median", "none"].includes(value as never));
  const [showMeasurementInterval, setShowMeasurementInterval] = useWorkspaceState("encapsulation:interval", false);
  const [showConnections, setShowConnections] = useWorkspaceState("encapsulation:connections", false);
  const selectedMaterials = selections.map((item) => item.material);
  const { groups: availableGroups, excluded } = encapsulationGroups((dataset?.samples ?? []).filter(sample => ribbonSampleIds.has(sample.sample_uid)), dataset?.observations ?? [], selectedMaterials, dataset?.files ?? [], splitByRibbon);
  availableGroups.sort((a, b) => selections.findIndex((item) => item.material === a.family) - selections.findIndex((item) => item.material === b.family) || a.material.localeCompare(b.material) || a.batch.localeCompare(b.batch, "en", { numeric: true }) || processOrder(a.recipe) - processOrder(b.recipe) || (a.recipe || "").localeCompare(b.recipe || "") || a.electrode.localeCompare(b.electrode));
  const groupLabels = encapsulationDisplayLabels(availableGroups, dataset?.recipes ?? []);
  const groups = availableGroups.filter((group) => !hiddenGroupKeys.has(group.key) && !excludedGroupKeys.has(group.key));
  const commonBatch = groups.length > 1 && groups[0].batch !== "unknown" && groups.every((group) => group.batch === groups[0].batch) ? groups[0].batch : null;
  const missing = [...new Set(selectedMaterials)].filter((material) => !availableGroups.some((group) => group.family === material));
  const values = groups.flatMap((group) => group.pairs.flatMap((pair) => [pair.before, pair.after]));
  const min = values.length ? Math.max(0, Math.floor(Math.min(...values)) - 1) : 0;
  const max = values.length ? Math.ceil(Math.max(...values)) + 1 : 1;
  const width = Math.max(720, groups.length * (splitByRibbon ? 290 : 230) + 100);
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
  const manifest = dataset ? pairedFigureManifest(dataset, availableGroups, { selectedMaterials, hiddenGroupKeys:[...hiddenGroupKeys], excludedGroupKeys:[...excludedGroupKeys], showMeasurementInterval, showConnections, colors:selections, yMin:min, yMax:max, deltaSummary, allowedSampleUids:[...ribbonSampleIds], ribbonSelection, splitByRibbon }) : null;
  const exportGraphic = async (format: "svg" | "png", preset: "default" | "report" = "default") => {
    if (!svgRef.current || !manifest) return;
    setExportError(null);
    try { await downloadScientificGraphic(svgRef.current,width,height,manifest,"encapsulation-before-after",format,preset); }
    catch (error) { setExportError(error instanceof Error ? error.message : "Export failed"); }
  };
  const summaryHelp = `The same physical cells are paired before encapsulation and after encapsulation, before ageing. Open points are before; filled points are after; optional thin lines connect the same cell. Boxes span Q1–Q3, with the median and 1.5 × IQR whiskers. Groups with different recorded metadata remain separate. Missing or unspecified equipment is labelled as the standard laminator according to the lab convention; this label does not merge distinct recorded processes. Ambiguous recipe codes are not treated as verified processes. QA-flagged or ambiguous pairs are excluded. Dates come from linked raw JV files when available. ${excluded} selected-material cells have no unique valid PCE pair.`;
  return <div className="encapsulation-workspace">
    <section className="chart-card encapsulation-summary" aria-label="Before and after encapsulation">
      <div className="chart-title"><div className="trend-panel-title"><strong>PCE avant / après encapsulation</strong><InfoTip text={summaryHelp} align="left" /></div><button type="button" className="soft-button" disabled={!groups.length} onClick={() => void exportGraphic("svg")}>Export SVG</button><button type="button" className="soft-button" disabled={!groups.length} onClick={() => void exportGraphic("svg", "report")}>Report SVG</button></div>
      {manifest && <div className="control-row">
        <button type="button" disabled={!groups.length} onClick={()=>void exportGraphic("png")}>Export PNG</button>
        <button type="button" onClick={()=>downloadFigureFile(pairedFigureCsv(manifest,"figure"),"encapsulation.figure.csv","text/csv")}>Data shown in figure CSV</button>
        <button type="button" onClick={()=>downloadFigureFile(pairedFigureCsv(manifest,"full-selected"),"encapsulation.full-selected.csv","text/csv")}>Full selected dataset CSV</button>
        <button type="button" onClick={()=>downloadFigureFile(JSON.stringify(manifest,null,2),"encapsulation.figure.json","application/json")}>Figure manifest JSON</button>
        <button type="button" onClick={()=>void navigator.clipboard.writeText(manifest.caption).catch(()=>downloadFigureFile(manifest.caption,"encapsulation.caption.txt","text/plain"))}>Copy caption</button>
      </div>}
      {exportError && <p role="alert">{exportError}</p>}
      {missing.length > 0 && <p role="status">No paired data for: {missing.join(" · ")}. Choose another encapsulant above.</p>}
      {availableGroups.length > 0 && <fieldset className="encapsulation-group-filter">
        <legend>Displayed batches <InfoTip text="Hide a formulation/batch group from the PCE chart, summary table, SVG export and JV diagnostic. The source data remain unchanged." align="left" /></legend>
        <div>{availableGroups.map((group) => {
          const groupLabel = groupLabels.get(group.key);
          return <label key={group.key}>
            <input type="checkbox" checked={!hiddenGroupKeys.has(group.key)} onChange={() => toggleGroup(group.key)} />
            <span>{group.material} · batch {group.batch}{groupLabel ? ` · ${groupLabel}` : ""}{splitByRibbon ? ` · ${ribbonLabel(group.ribbon)}` : ""} · n={group.pairs.length}</span>
          </label>;
        })}</div>
        <details><summary>Exclude groups from this analysis (reason recorded: user_excluded)</summary>{availableGroups.map(group=><label key={group.key}><input type="checkbox" checked={excludedGroupKeys.has(group.key)} onChange={()=>setExcludedGroupKeys(current=>{const next=new Set(current); if(next.has(group.key)) next.delete(group.key); else next.add(group.key); return next;})} /> Exclude {group.material} · {group.batch}{groupLabels.get(group.key) ? ` · ${groupLabels.get(group.key)}` : ""}{splitByRibbon ? ` · ${ribbonLabel(group.ribbon)}` : ""}</label>)}</details>
        {groups.length < availableGroups.length && <button type="button" className="soft-button" onClick={() => setHiddenGroupKeys(new Set())}>Show all</button>}
      </fieldset>}
      {availableGroups.length > 0 && <label>Paired change summary <select value={deltaSummary} onChange={event => setDeltaSummary(event.target.value as typeof deltaSummary)}><option value="median">Median of individual changes</option><option value="mean">Mean of individual changes</option><option value="none">Individual values only</option></select></label>}
      {availableGroups.length > 0 && <label className="encapsulation-interval-toggle"><input type="checkbox" checked={showMeasurementInterval} onChange={(event) => setShowMeasurementInterval(event.target.checked)} /> Show before→after interval in chart and SVG</label>}
      {availableGroups.length > 0 && <label className="encapsulation-interval-toggle"><input type="checkbox" checked={showConnections} onChange={event=>setShowConnections(event.target.checked)} /> Connect same cells</label>}
      {availableGroups.length > 0 && groups.length === 0 && <div className="missing-selection"><strong>No batch displayed</strong><span>Select at least one batch above to restore the chart.</span></div>}
      {groups.length > 0 && <>
        <div style={{ overflowX: "auto" }}>
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="PCE avant et après encapsulation, par formulation et lot" style={{ background: "white", fontFamily: "Arial, sans-serif", color: "#222" }}>
            <rect width={width} height={height} fill="white" />
            <text x={width / 2} y={28} textAnchor="middle" fontSize={18} fontWeight="bold">PCE avant / après encapsulation</text>
            {commonBatch && <text x={width / 2} y={47} textAnchor="middle" fontSize={11}>Lot {commonBatch}</text>}
            <text x={20} y={180} transform="rotate(-90 20 180)" textAnchor="middle" fontSize={14}>PCE (%)</text>
            {Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5).map((value) => <g key={value}><line x1={65} x2={width - 20} y1={y(value)} y2={y(value)} stroke="#ddd" /><text x={55} y={y(value) + 4} textAnchor="end" fontSize={12}>{value.toFixed(1)}</text></g>)}
            {groups.map((group, index) => {
              const center = 100 + (index + 0.5) * (width - 120) / groups.length;
              const color = selections.find((item) => item.material === group.family)?.color ?? "#336699";
              const groupLabel = [groupLabels.get(group.key), splitByRibbon ? ribbonLabel(group.ribbon) : null].filter(Boolean).join(" · ");
              const changes = pairedChanges(group.pairs);
              const relativeChange = deltaSummary === "none" ? null : changes.relative[deltaSummary];
              const dayRange = pairedMeasurementDayRange(group.pairs);
              const dayLabel = dayRange === null ? "—" : dayRange.min === dayRange.max ? `${dayRange.min} j` : `${dayRange.min}–${dayRange.max} j`;
              const beforeOffsets = pointOffsets(group.pairs.map((pair) => y(pair.before)));
              const afterOffsets = pointOffsets(group.pairs.map((pair) => y(pair.after)));
              return <g key={group.key}>
                {showConnections && group.pairs.map((pair, pairIndex) => <line key={`pair-${pair.sampleUid}`} x1={center - 36 + beforeOffsets[pairIndex]} x2={center + 36 + afterOffsets[pairIndex]} y1={y(pair.before)} y2={y(pair.after)} stroke={color} strokeWidth={1.2} opacity={0.42}><title>{pair.reference}: {pair.before}% → {pair.after}%</title></line>)}
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
                    {group.pairs.map((pair, i) => <circle key={pair.sampleUid} cx={x + offsets[i]} cy={y(pair[stage])} r={3.5} fill={stageIndex ? color : "white"} stroke={color}><title>{pair.reference} : {figureStageLabel(stage)} {pair[stage]} %</title></circle>)}
                    <text x={x} y={323} textAnchor="middle" fontSize={12}>{figureStageLabel(stage)}</text>
                  </g>;
                })}
                <text x={center} y={348} textAnchor="middle" fontSize={12} fontWeight="bold">{figureFormulationLabel({material_family:group.family,material_raw:group.material})}</text>
                {groupLabel && <text x={center} y={369} textAnchor="middle" fontSize={11}>{groupLabel}</text>}
                <text x={center} y={groupLabel ? 390 : 371} textAnchor="middle" fontSize={11}>{commonBatch ? "" : `Lot ${group.batch} · `}<tspan fontStyle="italic">n</tspan> = {group.pairs.length}{group.electrode === "Cu" ? "" : ` · ${group.electrode}`}</text>
                {deltaSummary !== "none" && <text x={center} y={groupLabel ? 411 : 392} textAnchor="middle" fontSize={11} fill="#5f6875"><tspan>{deltaSummary === "mean" ? "Moyenne" : "Médiane"} ΔPCE</tspan><tspan baselineShift="sub" fontSize={8}>rel</tspan><tspan> = {relativeChange === null ? "—" : `${relativeChange < 0 ? "−" : relativeChange > 0 ? "+" : ""}${Math.abs(relativeChange).toFixed(1)} %`}{changes.relative.n === group.pairs.length ? "" : ` · n = ${changes.relative.n}`}</tspan></text>}
                {showMeasurementInterval && <text x={center} y={groupLabel ? 432 : 413} textAnchor="middle" fontSize={11} fill="#5f6875">Avant→après {dayLabel}</text>}
              </g>;
            })}
          </svg>
        </div>
        <details><summary>Individual paired changes and alternative summaries</summary>{groups.map(group => { const changes = pairedChanges(group.pairs); return <div key={group.key}><h4>{group.material} / {group.batch}{groupLabels.get(group.key) ? ` / ${groupLabels.get(group.key)}` : ""}{splitByRibbon ? ` / ${ribbonLabel(group.ribbon)}` : ""}</h4><p>Median ΔPCE: {changes.absolute.median?.toFixed(2)} pp · Median individual relative change: {changes.relative.median?.toFixed(2) ?? "—"}% (n={changes.relative.n}) · Relative change of group means: {changes.relativeChangeOfGroupMeans?.toFixed(2) ?? "—"}%</p><table><thead><tr><th>Cell</th><th>Before (%)</th><th>After (%)</th><th>Δ (pp)</th><th>Individual Δ (%)</th><th>Before→after interval</th></tr></thead><tbody>{group.pairs.map((pair,i) => { const days = pairedMeasurementDayRange([pair]); return <tr key={pair.sampleUid}><td>{pair.sampleUid}</td><td>{pair.before}</td><td>{pair.after}</td><td>{changes.individual[i].absolute.toFixed(2)}</td><td>{changes.individual[i].relative?.toFixed(2) ?? "Unavailable: before = 0"}</td><td>{days ? `${days.min}–${days.max} d` : "Unknown"}</td></tr>; })}</tbody></table></div>; })}</details>
        <div className="table-scroll"><table><thead><tr><th>Formulation / batch</th><th>Paired n</th><th>Mean before (%)</th><th>Mean after (%)</th><th>Mean paired Δη (pp)</th><th>Mean paired ΔPCErel (%) <InfoTip text="Mean of the relative PCE change calculated separately for each paired cell: (after − before) / before × 100%." align="right" /></th><th>Measurement timeline <InfoTip text="Before measurement → encapsulation → after measurement. Dates appear only when the raw files link unambiguously to the same physical cell." align="right" /></th></tr></thead><tbody>{groups.map((group) => {
          const beforeDates = group.pairs.map((pair) => pair.beforeMeasurementDate).filter((value): value is string => Boolean(value));
          const encapsulationDates = group.pairs.map((pair) => pair.encapsulationDate).filter((value): value is string => Boolean(value));
          const afterDates = group.pairs.flatMap((pair) => pair.afterMeasurementDates);
          const relativeChange = meanPairedRelativeChange(group.pairs);
          return <tr key={group.key}><td>{group.material} / {group.batch}{groupLabels.get(group.key) ? ` / ${groupLabels.get(group.key)}` : ""}{splitByRibbon ? ` / ${ribbonLabel(group.ribbon)}` : ""}{group.electrode === "Cu" ? "" : ` / ${group.electrode}`}</td><td>{group.pairs.length}</td><td>{mean(group.pairs.map((pair) => pair.before)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after)).toFixed(2)}</td><td>{mean(group.pairs.map((pair) => pair.after - pair.before)).toFixed(2)}</td><td>{relativeChange === null ? "—" : relativeChange.toFixed(2)}</td><td>{dateRange(beforeDates)} → {dateRange(encapsulationDates)} → {dateRange(afterDates)}</td></tr>;
        })}</tbody></table></div>
      </>}
    </section>
    {dataset ? <EncapsulationJVComparison dataset={dataset} pairs={rawCurvePairs} selections={selections} splitByRibbon={splitByRibbon} /> : null}
    {dataset ? <StagedAgeing dataset={dataset} materials={selectedMaterials} ribbonSampleIds={ribbonSampleIds} ribbonSelection={ribbonSelection} splitByRibbon={splitByRibbon} /> : null}
    {dataset ? <SynchronizedMetrics dataset={dataset} materials={selectedMaterials} ribbonSampleIds={ribbonSampleIds} ribbonSelection={ribbonSelection} /> : null}
  </div>;
}

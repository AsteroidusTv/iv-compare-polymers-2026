import { boxStatistics, meanPairedRelativeChange, pairedChanges, pairedMeasurementDayRange, type EncapsulationGroup } from "./encapsulation";
import { datasetPackageHash, type IVDataset } from "./iv-data";
import { buildIdentity } from "./build-identity";
import { numeric } from "./science";

/** Inventory PCE provenance is independent of raw JV quantitative eligibility. */
export function pairedFigureManifest(dataset: IVDataset, groups: EncapsulationGroup[], options: {
  selectedMaterials: string[]; hiddenGroupKeys: string[]; showMeasurementInterval: boolean;
  colors: { material: string; color: string }[]; yMin: number; yMax: number;
  excludedGroupKeys?: string[];
  deltaSummary?: "mean" | "median" | "none";
}) {
  const included = new Map(groups.flatMap(group => group.pairs.map(pair => [pair.sampleUid, { group, pair }] as const)));
  const candidates = dataset.samples.filter(sample => options.selectedMaterials.includes(sample.material_family)).map(sample => {
    const observations = dataset.observations.filter(row => row.sample_uid === sample.sample_uid && row.test_type === "Unaged");
    const item = included.get(sample.sample_uid);
    const reasons: string[] = [];
    if (!numeric(sample.initial_efficiency_pct) || sample.initial_efficiency_pct < 0) reasons.push("missing_or_invalid_initial_pce");
    if (observations.length !== 1) reasons.push(observations.length ? "ambiguous_unaged_observations" : "missing_unaged_observation");
    if (observations.length === 1) {
      if (!numeric(observations[0].efficiency_pct) || observations[0].efficiency_pct < 0) reasons.push("missing_or_invalid_unaged_pce");
      if (observations[0].data_quality_flag) reasons.push("unaged_qa_flag");
    }
    if (!item && !reasons.length) reasons.push("not_in_supplied_analysis_groups");
    const pair = item?.pair;
    const userExcluded = Boolean(item && options.excludedGroupKeys?.includes(item.group.key));
    if (userExcluded) reasons.push("user_excluded");
    return {
      sampleUid: sample.sample_uid, groupKey: item?.group.key ?? null,
      analyticalEligible: Boolean(item) && !userExcluded, exclusionReasons: reasons,
      visuallyHidden: item ? options.hiddenGroupKeys.includes(item.group.key) : false,
      rawSample: sample, rawUnagedObservations: observations,
      linkedFiles: dataset.files.filter(file => file.reference_sample_uid === sample.sample_uid || (file.sample_uid === sample.sample_uid && file.inferred_test_type === "Unaged")),
      pair: pair ? { ...pair, deltaPcePp: pair.after - pair.before,
        deltaPceRelativePct: pair.before === 0 ? null : (pair.after - pair.before) / pair.before * 100,
        normalizationDenominator: pair.before, relativeChangeUnavailableReason: pair.before === 0 ? "zero_before" : null,
        measurementDayRange: pairedMeasurementDayRange([pair]) } : null,
    };
  });
  const visible = groups.filter(group => !options.hiddenGroupKeys.includes(group.key) && !options.excludedGroupKeys?.includes(group.key));
  const summaries = groups.filter(group => !options.excludedGroupKeys?.includes(group.key)).map(group => ({ ...group, visuallyHidden: options.hiddenGroupKeys.includes(group.key),
    pairedChanges: pairedChanges(group.pairs),
    beforeBox: boxStatistics(group.pairs.map(pair => pair.before)), afterBox: boxStatistics(group.pairs.map(pair => pair.after)),
    boxesDrawn: group.pairs.length >= 3, meanPairedRelativeChange: meanPairedRelativeChange(group.pairs),
    dateCoverage: { totalPairs: group.pairs.length, pairsWithInterval: group.pairs.filter(pair => pairedMeasurementDayRange([pair]) !== null).length },
  }));
  const caption = `PCE before and after encapsulation for ${visible.reduce((n, group) => n + group.pairs.length, 0)} paired inventory cells, grouped by formulation, batch, recorded process and electrode. Open/filled points: before/after; connecting lines: same cell. Boxes: Q1–Q3 (linearly interpolated percentiles, h=(n−1)p); median line; whiskers: furthest observed values within 1.5 IQR. For n<3, individual points only. Mean relative change is the mean of (after−before)/before ×100, omitting zero denominators. Source: Initial Eff → Unaged. Measurement intervals, where available, are not process durations. QA-flagged and ambiguous pairs excluded; hidden groups are display-only selections.`;
  return { schemaVersion: "iv-compare-paired-figure/1", generatedAt: new Date().toISOString(), kind: "paired-pce", title: "PCE before / after encapsulation", caption,
    dataset: { name: dataset.name, schemaVersion: dataset.schemaVersion, packageSha256: datasetPackageHash(dataset), provenance: dataset.provenance },
    sourceCode: buildIdentity, selection: options, candidates, groups: summaries,
    actualContributors: candidates.filter(row => row.analyticalEligible).map(row => row.sampleUid),
    visibleContributors: candidates.filter(row => row.analyticalEligible && !row.visuallyHidden).map(row => row.sampleUid),
    policy: { ruleVersion: "paired-inventory/1", missingIsZero: false, interpolation: "none", hiddenGroups: "visual_only", qa: "exclude flagged unique Unaged observations", unit: "PCE percent", quartiles: "Hyndman–Fan type 7", whiskers: "last observed values within Q1−1.5IQR and Q3+1.5IQR", dateRule: "unique linked reference date; all linked Unaged dates retained" },
  };
}
export type PairedFigureManifest = ReturnType<typeof pairedFigureManifest>;

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value === "string" && /^\s*[=+@-]/.test(value)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
/** Analytical CSV = visible figure pairs; full selected = every candidate, including hidden/excluded. */
export function pairedFigureCsv(manifest: PairedFigureManifest, scope: "figure" | "full-selected") {
  const columns = ["scope", "sample_uid", "group_key", "analytical_eligible", "visually_hidden", "exclusion_reasons", "before_pce_pct", "after_pce_pct", "delta_pce_pp", "delta_pce_relative_pct", "before_measurement_date", "encapsulation_date", "after_measurement_dates", "day_range", "package_sha256", "source_code", "candidate_provenance"];
  const rows = manifest.candidates.filter(row => scope === "full-selected" || (row.analyticalEligible && !row.visuallyHidden)).map(row => [scope, row.sampleUid, row.groupKey, row.analyticalEligible, row.visuallyHidden, row.exclusionReasons, row.pair?.before ?? row.rawSample.initial_efficiency_pct, row.pair?.after ?? null, row.pair?.deltaPcePp, row.pair?.deltaPceRelativePct, row.pair?.beforeMeasurementDate, row.pair?.encapsulationDate, row.pair?.afterMeasurementDates, row.pair?.measurementDayRange, manifest.dataset.packageSha256, manifest.sourceCode, row]);
  return [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

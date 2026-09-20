"use client";

import { DragEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CurveChart, CurveSeries, TrendChart, TrendPoint, TrendSeries } from "./components/Charts";
import { EncapsulationComparison } from "./components/EncapsulationComparison";
import { JVDiagnosticDetails } from "./components/JVDiagnosticDetails";
import { labQualityIssues } from "./lib/lab-quality";
import { ageingSampleCandidates, resolveAgeingTimes, toggleAgeingTime } from "./lib/iv-ageing";
import { FieldTitle, InfoTip } from "./components/InfoTip";
import {
  Aggregation,
  datasetPackageHash,
  fetchDefaultDataset,
  importDatasetFiles,
  IVDataset,
  METRICS,
  MetricKey,
} from "./lib/iv-data";
import { getJVDiagnostics, chooseSpecimenFirstMeasurement, type JVDiagnostic } from "./lib/jv-science";
import { materialStyle } from "./lib/material-style";
import { buildIdentity } from "./lib/build-identity";
import { normalizationTraces } from "./lib/normalization-trace";
import { missingnessTable } from "./lib/missingness";
import { fullSelectionCsv } from "./lib/figure-export";
import { downloadFigureFile } from "./lib/browser-figure-download";
import { analysisGroups, cohortTimeline, type AnalysisGrouping } from "./lib/cohort";
import { describeGraphElectrode } from "./lib/chart-export";
import { resolveSelectedSampleIds, toggleSelectedSampleId } from "./lib/sample-selection";
import {
  measurementQualityReasons,
  numeric,
  outdoorQualityReason,
  summarise,
  TimedValue,
} from "./lib/science";
import {
  createInitialSeries,
  metricOptionsFor,
  normalizeSeriesConfig,
  SeriesConfig,
  seriesSamplePasses,
  stressesForConfig,
} from "./lib/comparison";

const MAX_SERIES = 8;
const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const fr = numberFormat;
type View = "trend" | "curves" | "encapsulation";
type ValueMode = "absolute" | "retention";
type TrendDisplay = "aggregate" | "samples";
type CurrentConvention = "instrument" | "pv";
type SweepView = "primary" | "all";
type CurveScale = "primary" | "all";
type CurveComparison = "ageing" | "materials";
type SeriesId = string;
type OutdoorQualityIssue = {
  observationId: string;
  sampleUid: string;
  time: number | null;
  value: number;
  reason: string;
};
type ContextTrendSeries = TrendSeries & {
  config: SeriesConfig;
  xUnit: string;
  yUnit: string;
  contextLabel: string;
  baselineWarnings: string[];
  sampleSetChanges: boolean;
  parentSeriesId?: string;
};

const SAMPLE_LINE_PATTERNS = [undefined, "8 4", "2 4", "11 4 2 4", "14 4", "5 3"];

const METRIC_HELP: Record<MetricKey, string> = {
  efficiency_pct: "Efficiency is the maximum electrical power delivered divided by the incident light power. It combines the effects of Jsc, Voc, and fill factor.",
  jsc_mA_cm2: "Jsc is the short-circuit current density evaluated at V = 0. It mainly reflects the generation and collection of photogenerated charge carriers.",
  voc_V: "Voc is the open-circuit voltage measured when current is zero. It is sensitive to recombination losses and interface quality.",
  ff_pct: "Fill factor measures how rectangular the IV curve is: FF = Pmax / (Voc × Jsc). A decrease often indicates greater resistive or recombination losses.",
  outdoor_pr_pct: "Performance Ratio (PR) reported by the logger, summarised as the daily median of measurements recorded at irradiance levels of at least 200 W/m². This threshold excludes night-time and very low light levels, where the ratio becomes unstable.",
  outdoor_pmpp_W: "Power measured at the maximum power point outdoors, summarised as the median of measurements acquired at irradiance levels of at least 200 W/m². Files without irradiance use the median of positive Pmpp values and are explicitly flagged.",
  outdoor_irradiance_W_m2: "Median incident irradiance for the same daylight observations used to summarise PR and Pmpp. It provides measurement context and is not itself a stability metric.",
};

const HELP = {
  polymer: "Family is a navigation label, not proof that formulations, batches or processes are interchangeable. Analysis grouping and filters are explicit below.",
  addMaterial: "Adds another independent comparison series. The same encapsulant can be selected more than once with a different ageing protocol or metric.",
  ageing: "Applied ageing protocol: DH means damp heat, TC means thermal cycling, and Outdoor means outdoor exposure. Durations are comparable only within the same protocol.",
  retention: "Retention = value at time t / reference value for the same sample × 100. For DH/TC, the reference is the initial state. For Outdoor, at least three valid days are required and the reference is the median of up to the first seven valid days. Sensitivity to 3-, 7-, and 14-day windows is reported when possible.",
  labConvention: "Recipe, batch, formulation and electrode are recorded metadata, not confirmed interchangeable treatments. The dataset includes multiple Ag-labelled specimens; laboratory adjudication remains pending.",
  traceDisplay: "Individual samples draws one separate trajectory for every checked patch, using the same material colour and different line patterns. Mean or Median replaces those trajectories with one aggregate curve per material.",
  matching: "Matching links each IV file to an inventory sample using its metadata. “To resolve” contains only genuinely ambiguous or unidentified files. Reference cells and files already placed in laboratory Trash folders are retained separately for audit and do not participate in polymer comparisons.",
  observations: "Total number of individual measurements contributing to the points currently shown. This is not the number of durations or averages.",
  interval: "For each duration, the main line shows the selected aggregate. Mean values carry a 95% confidence interval; median values carry an interquartile range. Min and max remain available in the export.",
  replicates: "When n > 1, select n to open the individual observations. Choosing a sample changes only the plotted point; the aggregate, calculations, and exports remain unchanged.",
  globalReplicate: "Sample filters are independent for every series. Checking or unchecking a sample immediately updates the individual curves. Choose Mean or Median above to replace them with one aggregate curve per material. At least one sample remains selected.",
  patchReference: "Sample name and reference from the Excel inventory. In aggregate mode, the cell lists the samples contributing to the point; in individual mode, it identifies the exact plotted sample.",
  targetTime: "Only measurements acquired at this exact ageing duration are eligible. This prevents curves from different ageing times being overlaid as if they were equivalent.",
  curveChoice: "An example near the group median is selected specimen first, then sweep. Repeat acquisitions do not add independent specimens. Metrologically unresolved curves are excluded by default; inspect them separately, not as validated quantitative examples.",
  convention: "The instrument convention displays negative photocurrent, matching the raw solar simulator values. The PV convention only reverses the sign to show positive generated current; the underlying physics does not change.",
  sweep: "The point sequence is split when a voltage jump or sweep reversal is detected. The primary segment normally covers V = 0 and the Voc crossing; other segments are retained.",
  scale: "The ‘Primary segments’ scale stays readable for material comparisons. ‘All data’ expands the axes to secondary segments without changing any values.",
  rawPoints: "Shows every measured point. No interpolation or smoothing is used to draw the line between successive points in a segment.",
  landmarks: "Jsc is interpolated at V = 0, Voc at J = 0, and MPP is the measured point that maximises delivered power. These landmarks help read the curve; they do not replace values from the source software.",
  qa: "Also includes measurements with an automatic flag, such as an extreme value, ambiguous metadata, or another inconsistency. They are hidden by default to avoid fragile conclusions.",
  outdoorQa: "Outdoor values are checked against conservative physical bounds and against the history of the same sample. Only extreme high-side spikes are detected statistically, so a genuine performance loss is not hidden. Flagged values stay in the source data and can be restored with this control.",
  pointAudit: "The numerator is the number of points plotted in the selected mode; the denominator is the total number of points in the files. Hidden points are never deleted.",
  segmentation: "The primary segment is selected automatically based on sweep continuity, inclusion of V = 0, and consistency with Voc. Every segment keeps its original acquisition order.",
  efficiency: "Maximum power extracted under illumination, divided by incident power and expressed as a percentage.",
  voc: "Open-circuit voltage at the point where current density crosses zero.",
  jsc: "Current density at V = 0. The card retains the positive value reported by the software even when the curve uses the negative instrument convention.",
  ff: "FF = Pmax / (Voc × Jsc). A sharper knee and lower resistive losses produce a higher value.",
} as const;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "en"));
}

function timeUnit(stress: string): string {
  if (stress === "TC" || stress === "DH+TC") return "cycles";
  if (stress === "Outdoor") return "days";
  return "h";
}

function ageingReportLabel(stress: string): string {
  if (stress === "DH") return "damp-heat ageing";
  if (stress === "TC") return "thermal-cycling ageing";
  if (stress === "DH+TC") return "combined damp-heat and thermal-cycling ageing";
  if (stress === "Outdoor") return "outdoor exposure";
  if (stress === "Unaged") return "the initial state";
  return `${stress} ageing`;
}

function trendRowKey(seriesId: SeriesId, time: number): string {
  return `${seriesId}:${time}`;
}

export default function Home() {
  const [dataset, setDataset] = useState<IVDataset | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadMessage, setLoadMessage] = useState("Loading dataset…");
  const [view, setView] = useState<View>("trend");
  const [seriesConfigs, setSeriesConfigs] = useState<SeriesConfig[]>([]);
  const [mode, setMode] = useState<ValueMode>("retention");
  const [aggregation, setAggregation] = useState<Aggregation>("median");
  const [grouping, setGrouping] = useState<AnalysisGrouping>("conservative");
  const [cohortMode, setCohortMode] = useState<"available" | "constant">("available");
  const [cohortStart, setCohortStart] = useState(0);
  const [cohortEnd, setCohortEnd] = useState(100);
  const [outdoorWindow, setOutdoorWindow] = useState<3 | 7 | 14>(7);
  const [inspectUnsafeJV, setInspectUnsafeJV] = useState(false);
  const [trendDisplay, setTrendDisplay] = useState<TrendDisplay>("samples");
  const [includeQa, setIncludeQa] = useState(false);
  const [curveTime, setCurveTime] = useState<number | null>(null);
  const [curveComparison, setCurveComparison] = useState<CurveComparison>("ageing");
  const [curveAgeingSample, setCurveAgeingSample] = useState<string | null>(null);
  const [curveAgeingTimes, setCurveAgeingTimes] = useState<number[]>([]);
  const [currentConvention, setCurrentConvention] = useState<CurrentConvention>("instrument");
  const [sweepView, setSweepView] = useState<SweepView>("primary");
  const [curveScale, setCurveScale] = useState<CurveScale>("primary");
  const [showCurvePoints, setShowCurvePoints] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesId>>(() => new Set());
  const [expandedTrendRows, setExpandedTrendRows] = useState<Set<string>>(() => new Set());
  const [trendSampleFilters, setTrendSampleFilters] = useState<Record<SeriesId, string[]>>({});
  const [curveMeasurementIds, setCurveMeasurementIds] = useState<Record<SeriesId, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextSeriesIdRef = useRef(2);

  const installDataset = useCallback((next: IVDataset, message: string) => {
    setDataset(next);
    setLoadState("ready");
    setLoadMessage(message);
    setSeriesConfigs(createInitialSeries(next));
    nextSeriesIdRef.current = 2;
    setHiddenSeries(new Set());
    setExpandedTrendRows(new Set());
    setTrendSampleFilters({});
    setCurveMeasurementIds({});
    setCurveAgeingSample(null);
    setCurveAgeingTimes([]);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDefaultDataset()
      .then((next) => active && installDataset(next, "Dataset loaded"))
      .catch((error: Error) => {
        if (!active) return;
        setLoadState("error");
        setLoadMessage(error.message);
      });
    return () => { active = false; };
  }, [installDataset]);

  const processFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setLoadState("loading");
    setLoadMessage(files.length === 1 ? "Reading package…" : "Converting workbook and IV points…");
    try {
      const next = await importDatasetFiles(files);
      installDataset(next, `${next.name} loaded`);
    } catch (error) {
      setLoadState("error");
      setLoadMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [installDataset]);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void processFiles(Array.from(event.dataTransfer.files));
  };

  const materials = useMemo(() => unique(dataset?.samples.map((sample) => sample.material_family) ?? []), [dataset]);
  const comparisonMaterials = useMemo(() => seriesConfigs.map((config) => config.material).filter(Boolean), [seriesConfigs]);
  const sampleMap = useMemo(() => new Map(dataset?.samples.map((sample) => [sample.sample_uid, sample]) ?? []), [dataset]);
  const jvDiagnostics = useMemo<ReadonlyMap<string, JVDiagnostic>>(() => dataset ? getJVDiagnostics(dataset) : new Map(), [dataset]);
  const samplePasses = useCallback((sampleId: string | null | undefined, config: SeriesConfig) => dataset ? seriesSamplePasses(dataset, sampleId, config) : false, [dataset]);

  const outdoorQualityByMetric = useMemo(() => {
    const result = new Map<MetricKey, Map<string, OutdoorQualityIssue>>();
    if (!dataset) return result;
    (["outdoor_pr_pct", "outdoor_pmpp_W", "outdoor_irradiance_W_m2"] as MetricKey[]).forEach((metric) => {
      const issues = new Map<string, OutdoorQualityIssue>();
      const peersBySample = new Map<string, TimedValue[]>();
      dataset.observations.forEach((observation) => {
        const value = observation[metric];
        const time = observation.exposure_duration_numeric;
        if (observation.test_type !== "Outdoor" || !numeric(value) || !numeric(time) || observation.data_quality_flag) return;
        const peers = peersBySample.get(observation.sample_uid) ?? [];
        peers.push({ time, value });
        peersBySample.set(observation.sample_uid, peers);
      });
      dataset.observations.forEach((observation) => {
        const value = observation[metric];
        if (observation.test_type !== "Outdoor" || !numeric(value)) return;
        const reason = outdoorQualityReason(observation, metric, peersBySample.get(observation.sample_uid) ?? []);
        if (reason) issues.set(observation.observation_uid, { observationId: observation.observation_uid, sampleUid: observation.sample_uid, time: observation.exposure_duration_numeric ?? null, value, reason });
      });
      result.set(metric, issues);
    });
    return result;
  }, [dataset]);

  const labQualityByMetric = useMemo(() => new Map(
    (["efficiency_pct", "jsc_mA_cm2", "voc_V", "ff_pct"] as MetricKey[]).map((metric) => [metric, labQualityIssues(dataset?.observations ?? [], metric)]),
  ), [dataset]);
  const relevantLabIssues = useMemo(() => {
    const issues = new Map<string, string>();
    if (!dataset) return issues;
    for (const config of seriesConfigs) {
      for (const observation of dataset.observations) {
        if ((observation.test_type !== config.stress && observation.test_type !== "Unaged") || !samplePasses(observation.sample_uid, config)) continue;
        const reason = labQualityByMetric.get(config.metric)?.get(observation.observation_uid);
        if (reason) issues.set(observation.observation_uid, `${observation.sample_uid} · ${observation.test_type} · ${observation.exposure_duration_numeric ?? "reference"} ${observation.exposure_unit ?? ""}: ${reason}`);
      }
    }
    return issues;
  }, [dataset, seriesConfigs, samplePasses, labQualityByMetric]);

  const relevantOutdoorIssues = useMemo(() => {
    const issues = new Map<string, OutdoorQualityIssue>();
    seriesConfigs.filter((config) => config.stress === "Outdoor").forEach((config) => {
      outdoorQualityByMetric.get(config.metric)?.forEach((issue) => {
        if (samplePasses(issue.sampleUid, config)) issues.set(issue.observationId, issue);
      });
    });
    return [...issues.values()];
  }, [seriesConfigs, outdoorQualityByMetric, samplePasses]);

  const normalizationBySeries = useMemo(() => new Map(seriesConfigs.map(config => {
    const issues = new Map(labQualityByMetric.get(config.metric) ?? []);
    outdoorQualityByMetric.get(config.metric)?.forEach((issue, id) => issues.set(id, issue.reason));
    return [config.id, dataset ? normalizationTraces(dataset, {
      sampleUids: dataset.samples.filter(sample => samplePasses(sample.sample_uid, config)).map(sample => sample.sample_uid),
      protocol: config.stress, metric: config.metric, mode, includeQa, outdoorWindow, qaIssues: issues,
    }) : []];
  })), [dataset, seriesConfigs, labQualityByMetric, outdoorQualityByMetric, samplePasses, mode, includeQa, outdoorWindow]);

  const trendSeries = useMemo<ContextTrendSeries[]>(() => {
    if (!dataset) return [];
    const build = (config: SeriesConfig, index: number): ContextTrendSeries => {
      const color = materialStyle(config.material).color;
      const groups = new Map<number, TrendPoint["members"]>();
      const baselineWarnings = new Set<string>();
      (normalizationBySeries.get(config.id) ?? []).forEach(trace => {
        const observation = trace.observation;
        if (trace.baseline && trace.baseline.status !== "valid") baselineWarnings.add(`${observation.sample_uid}: ${trace.baseline.status}`);
        if (trace.baseline?.low) baselineWarnings.add(`${observation.sample_uid}: low initial PCE; inspect absolute values`);
        if (numeric(trace.baseline?.sensitivityPct) && trace.baseline.sensitivityPct > 5) baselineWarnings.add(`${observation.sample_uid}: baseline-window sensitivity ${trace.baseline.sensitivityPct.toFixed(1)}%`);
        if (trace.value === null) return;
        const value = trace.value;
        const x = config.stress === "Unaged" ? 0 : observation.exposure_duration_numeric;
        if (!numeric(x)) return;
        const members = groups.get(x) ?? [];
        const sample = sampleMap.get(observation.sample_uid);
        members.push({
          trace,
          observationId: observation.observation_uid,
          sampleUid: observation.sample_uid,
          sampleLabel: sample?.sample_label || sample?.sample_id_raw || observation.sample_uid,
          sampleReference: sample?.sample_id_raw || observation.sample_uid,
          batchNo: sample?.batch_no_raw || undefined,
          value,
        });
        groups.set(x, members);
      });
      const points: TrendPoint[] = [...groups.entries()].map(([x, members]) => {
        const orderedMembers = [...members].sort((left, right) => left.sampleUid.localeCompare(right.sampleUid, "fr") || left.observationId.localeCompare(right.observationId, "fr"));
        const values = orderedMembers.map((member) => member.value);
        const summary = summarise(values, aggregation);
        return {
          x,
          y: summary.value,
          min: summary.min,
          max: summary.max,
          intervalLow: summary.intervalLow,
          intervalHigh: summary.intervalHigh,
          intervalLabel: summary.intervalLabel,
          n: summary.n,
          members: orderedMembers,
        };
      }).sort((a, b) => a.x - b.x);
      const signatures = new Set(points.map((point) => point.members.map((member) => member.sampleUid).sort().join("|")));
      const electrodeNote = describeGraphElectrode(points.flatMap((point) => point.members.map((member) => sampleMap.get(member.sampleUid)?.electrode)));
      const contextLabel = [config.stress, METRICS[config.metric].label, electrodeNote].filter(Boolean).join(" · ");
      return { id: config.id, label: `${String.fromCharCode(65 + index)} · ${config.material}`, color, points, config, xUnit: timeUnit(config.stress), yUnit: mode === "retention" ? "% of reference" : METRICS[config.metric].unit, contextLabel, exportLabel: config.material, exportLegendKey: config.id, baselineWarnings: [...baselineWarnings], sampleSetChanges: signatures.size > 1 };
    };
    return seriesConfigs.map(build);
  }, [dataset, seriesConfigs, mode, aggregation, sampleMap, normalizationBySeries]);

  const sharedCurveStress = seriesConfigs.length && seriesConfigs.every((config) => config.stress === seriesConfigs[0].stress) ? seriesConfigs[0].stress : null;
  const curveXUnit = sharedCurveStress ? timeUnit(sharedCurveStress) : "";
  const displayedCurveXUnit = curveComparison === "ageing" ? timeUnit(seriesConfigs[0]?.stress ?? "") : curveXUnit;
  const eligibleFiles = useCallback((config: SeriesConfig) => {
    if (!dataset) return [];
    return dataset.files.filter((file) => {
      if (!file.match_status.startsWith("matched_") || !samplePasses(file.sample_uid, config)) return false;
      return file.inferred_test_type === config.stress;
    });
  }, [dataset, samplePasses]);

  const curveTimes = useMemo(() => {
    if (!sharedCurveStress) return { all: [], common: [] };
    const getTimes = (config: SeriesConfig) => eligibleFiles(config)
      .map((file) => config.stress === "Unaged" ? 0 : file.inferred_exposure_duration)
      .filter(numeric);
    const sets = seriesConfigs.map((config) => new Set(getTimes(config)));
    const common = sets.length ? [...sets[0]].filter((value) => sets.slice(1).every((set) => set.has(value))).sort((x, y) => x - y) : [];
    const all = [...new Set(sets.flatMap((set) => [...set]))].sort((x, y) => x - y);
    return { all, common };
  }, [eligibleFiles, seriesConfigs, sharedCurveStress]);

  const selectableCurveTimes = curveTimes.common.length ? curveTimes.common : curveTimes.all;
  const resolvedCurveTime = selectableCurveTimes.includes(curveTime as number) ? curveTime : selectableCurveTimes[selectableCurveTimes.length - 1] ?? null;

  const ageingCandidates = useMemo(() => dataset && seriesConfigs[0]
    ? ageingSampleCandidates(dataset, seriesConfigs[0], includeQa, inspectUnsafeJV)
    : [], [dataset, seriesConfigs, includeQa, inspectUnsafeJV]);
  const resolvedAgeingSample = ageingCandidates.find((candidate) => candidate.sampleUid === curveAgeingSample) ?? ageingCandidates[0] ?? null;
  const availableAgeingTimes = resolvedAgeingSample?.times.map((item) => item.time) ?? [];
  const selectedAgeingTimes = resolveAgeingTimes(availableAgeingTimes, curveAgeingTimes);

  const curveCandidateGroups = useMemo(() => {
    if (!dataset || resolvedCurveTime === null) return [];
    if (!sharedCurveStress) return [];
    return seriesConfigs.map((config) => {
      const color = materialStyle(config.material).color;
      const files = eligibleFiles(config).filter((file) => (config.stress === "Unaged" ? 0 : file.inferred_exposure_duration) === resolvedCurveTime);
      const fileIds = new Set(files.map((file) => file.file_uid));
      const candidates = dataset.measurements
        .filter((measurement) => fileIds.has(measurement.file_uid) && dataset.curves[measurement.measurement_uid] && (includeQa || measurementQualityReasons(measurement).length === 0) && (inspectUnsafeJV || jvDiagnostics.get(measurement.measurement_uid)?.quantitativeEligible))
        .sort((left, right) => left.measurement_uid.localeCompare(right.measurement_uid));
      return { seriesId: config.id, material: config.material, config, color, files, candidates };
    });
  }, [dataset, resolvedCurveTime, eligibleFiles, includeQa, seriesConfigs, sharedCurveStress, inspectUnsafeJV, jvDiagnostics]);

  const materialCurveSelections = useMemo(() => curveCandidateGroups.flatMap((group) => {
      if (!dataset) return [];
      const requested = curveMeasurementIds[group.seriesId];
      const measurement = requested
        ? group.candidates.find((candidate) => candidate.measurement_uid === requested) ?? chooseSpecimenFirstMeasurement(group.candidates, dataset, inspectUnsafeJV)
        : chooseSpecimenFirstMeasurement(group.candidates, dataset, inspectUnsafeJV);
      if (!measurement) return [];
      const file = group.files.find((item) => item.file_uid === measurement.file_uid);
      if (!file) return [];
      const curve = dataset.curves[measurement.measurement_uid];
      const points = curve.v.map((x, index) => ({ x, y: curve.j[index] }))
        .filter((point): point is { x: number; y: number } => numeric(point.x) && numeric(point.y));
      const analysis = jvDiagnostics.get(measurement.measurement_uid)!.analysis;
      return [{
        seriesId: group.seriesId,
        material: group.material,
        config: group.config,
        color: group.color,
        linePattern: undefined,
        measurement,
        file,
        actualTime: group.config.stress === "Unaged" ? 0 : file.inferred_exposure_duration as number,
        points,
        analysis,
      }];
    }), [curveCandidateGroups, curveMeasurementIds, dataset, inspectUnsafeJV, jvDiagnostics]);

  const ageingCurveSelections = useMemo(() => {
    if (!dataset || !resolvedAgeingSample || !seriesConfigs[0]) return [];
    return selectedAgeingTimes.flatMap((time, index) => {
      const candidate = resolvedAgeingSample.times.find((item) => item.time === time);
      if (!candidate) return [];
      const key = `ageing:${resolvedAgeingSample.sampleUid}:${time}`;
      const requested = curveMeasurementIds[key];
      const measurement = requested
        ? candidate.measurements.find((item) => item.measurement_uid === requested) ?? chooseSpecimenFirstMeasurement(candidate.measurements, dataset, inspectUnsafeJV)
        : chooseSpecimenFirstMeasurement(candidate.measurements, dataset, inspectUnsafeJV);
      if (!measurement) return [];
      const file = candidate.files.find((item) => item.file_uid === measurement.file_uid);
      const curve = dataset.curves[measurement.measurement_uid];
      if (!file || !curve) return [];
      const points = curve.v.map((x, pointIndex) => ({ x, y: curve.j[pointIndex] })).filter((point): point is { x: number; y: number } => numeric(point.x) && numeric(point.y));
      return [{
        seriesId: key,
        material: seriesConfigs[0].material,
        config: seriesConfigs[0],
        color: materialStyle(seriesConfigs[0].material).color,
        linePattern: SAMPLE_LINE_PATTERNS[index % SAMPLE_LINE_PATTERNS.length],
        measurement,
        file,
        actualTime: time,
        points,
        analysis: jvDiagnostics.get(measurement.measurement_uid)!.analysis,
      }];
    });
  }, [dataset, resolvedAgeingSample, selectedAgeingTimes, curveMeasurementIds, seriesConfigs, inspectUnsafeJV, jvDiagnostics]);

  const curveSelections = curveComparison === "ageing" ? ageingCurveSelections : materialCurveSelections;

  const currentPolarity = currentConvention === "instrument" ? -1 : 1;
  const curveSeries: CurveSeries[] = curveSelections.map((selection) => {
    const electrodeNote = describeGraphElectrode([sampleMap.get(selection.measurement.sample_uid ?? "")?.electrode]);
    return {
      id: selection.seriesId,
      label: curveComparison === "ageing"
        ? [`${fr.format(selection.actualTime)} ${timeUnit(selection.config.stress)}`, resolvedAgeingSample?.label, electrodeNote].filter(Boolean).join(" · ")
        : [`${String.fromCharCode(65 + seriesConfigs.findIndex((config) => config.id === selection.seriesId))} · ${selection.material}`, electrodeNote].filter(Boolean).join(" · "),
      color: selection.color,
      linePattern: selection.linePattern,
      segments: (sweepView === "primary"
        ? [selection.analysis.segments[selection.analysis.primaryIndex]]
        : selection.analysis.segments
      ).filter(Boolean).map((segment) => ({
        id: `${selection.measurement.measurement_uid}-${segment.id}`,
        isPrimary: segment.id === selection.analysis.segments[selection.analysis.primaryIndex]?.id,
        points: segment.points.map((point) => ({ x: point.x, y: point.y * currentPolarity, sourceIndex: point.sourceIndex })),
      })),
    };
  });
  const trendSampleOptions = Object.fromEntries(trendSeries.map((series) => {
    const byUid = new Map<string, TrendPoint["members"][number]>();
    series.points.forEach((point) => point.members.forEach((member) => {
      if (!byUid.has(member.sampleUid)) byUid.set(member.sampleUid, member);
    }));
    return [series.id, [...byUid.values()].sort((left, right) => left.sampleUid.localeCompare(right.sampleUid, "fr"))];
  })) as Record<SeriesId, TrendPoint["members"]>;
  const activeTrendSampleIds = Object.fromEntries(trendSeries.map((series) => {
    const availableIds = (trendSampleOptions[series.id] ?? []).map((member) => member.sampleUid);
    return [series.id, resolveSelectedSampleIds(availableIds, trendSampleFilters[series.id])];
  })) as Record<SeriesId, string[]>;
  const filteredTrendSeries = trendSeries.map((series) => {
    const options = trendSampleOptions[series.id] ?? [];
    const selectedIds = activeTrendSampleIds[series.id] ?? [];
    let selected = new Set(selectedIds);
    if (cohortMode === "constant") {
      const windowPoints = series.points.filter((point) => point.x >= cohortStart && point.x <= cohortEnd);
      selected = new Set(selectedIds.filter((id) => windowPoints.length > 0 && windowPoints.every((point) => point.members.some((member) => member.sampleUid === id))));
    }
    const points = series.points.flatMap((point) => {
      if (cohortMode === "constant" && (point.x < cohortStart || point.x > cohortEnd)) return [];
      const members = point.members.filter((member) => selected.has(member.sampleUid));
      if (!members.length) return [];
      const summary = summarise(members.map((member) => member.value), aggregation);
      const singleSample = selectedIds.length === 1 ? options.find((member) => member.sampleUid === selectedIds[0]) : undefined;
      return [{
        ...point,
        y: summary.value,
        min: summary.min,
        max: summary.max,
        intervalLow: summary.intervalLow,
        intervalHigh: summary.intervalHigh,
        intervalLabel: summary.n > 1 ? summary.intervalLabel : "single value" as const,
        n: summary.n,
        members,
        selectedLabel: singleSample ? `${singleSample.sampleLabel} · ${singleSample.sampleReference}` : undefined,
      }];
    });
    const subsetNote = selectedIds.length === options.length ? null : `${selectedIds.length}/${options.length} samples selected`;
    const signatures = new Set(points.map((point) => point.members.map((member) => member.sampleUid).sort().join("|")));
    return {
      ...series,
      points,
      contextLabel: [series.contextLabel, subsetNote].filter(Boolean).join(" · "),
      sampleSetChanges: signatures.size > 1,
    };
  });
  const selectedUnsplitSeries = filteredTrendSeries;
  const missingness = seriesConfigs.map(config => {
    const traces = normalizationBySeries.get(config.id) ?? [];
    const requested = trendSampleFilters[config.id];
    const excludedSampleUids = requested === undefined ? [] : [...new Set(traces.map(trace=>trace.observation.sample_uid))].filter(id=>!requested.includes(id));
    const points = filteredTrendSeries.find(series=>series.id===config.id)?.points ?? [];
    const rows = missingnessTable(traces, { protocol: config.stress, excludedSampleUids }).map(row => {
      const reasons = [...row.exclusionReasons];
      if (cohortMode === "constant") {
        if (row.time < cohortStart || row.time > cohortEnd) reasons.push("outside_cohort_window");
        else if (!points.some(point=>point.members.some(member=>member.sampleUid===row.sampleUid))) reasons.push("not_in_constant_cohort");
      }
      return { ...row, contributes: row.contributes && reasons.length === 0, exclusionReasons: reasons };
    });
    return { seriesId: config.id, protocol: config.stress, metric: config.metric, rows };
  });
  const selectedTrendSeries: ContextTrendSeries[] = selectedUnsplitSeries.flatMap((series) => {
    const ids = new Set(series.points.flatMap((point) => point.members.map((member) => member.sampleUid)));
    const groups = analysisGroups((dataset?.samples ?? []).filter((sample) => ids.has(sample.sample_uid)), grouping);
    return groups.map((group, groupIndex) => {
      const memberIds = new Set(group.samples.map((sample) => sample.sample_uid));
      const points = series.points.flatMap((point) => {
        const members = point.members.filter((member) => memberIds.has(member.sampleUid));
        if (!members.length) return [];
        const summary = summarise(members.map((member) => member.value), aggregation);
        return [{ ...point, y: summary.value, min: summary.min, max: summary.max, intervalLow: summary.intervalLow, intervalHigh: summary.intervalHigh, intervalLabel: summary.intervalLabel, n: summary.n, members }];
      });
      return { ...series, id: `${series.id}::group:${group.key}`, parentSeriesId: series.id, label: group.label, exportLabel: group.label, contextLabel: [series.config.stress, METRICS[series.config.metric].label, describeGraphElectrode(group.samples.map(sample => sample.electrode))].filter(Boolean).join(" · "), exportLegendKey: `${series.id}:${group.key}`, linePattern: SAMPLE_LINE_PATTERNS[groupIndex % SAMPLE_LINE_PATTERNS.length], points, sampleSetChanges: new Set(points.map((point) => point.members.map((member) => member.sampleUid).sort().join("|"))).size > 1 };
    });
  });
  const cohortDiagnostics = selectedTrendSeries.map((series) => ({ series, timeline: cohortTimeline(series.points.flatMap((point) => point.members.map((member) => ({ time: point.x, sampleUid: member.sampleUid, value: member.value, batch: member.batchNo }))), aggregation) }));
  const sampleTrendSeries: ContextTrendSeries[] = filteredTrendSeries.flatMap((series, parentIndex) => (
    (trendSampleOptions[series.id] ?? []).map((sample, sampleIndex) => ({ sample, sampleIndex })).filter(({ sample }) => activeTrendSampleIds[series.id]?.includes(sample.sampleUid)).map(({ sample, sampleIndex }) => {
      const points = series.points.flatMap((point) => {
        const members = point.members.filter((member) => member.sampleUid === sample.sampleUid);
        if (!members.length) return [];
        const summary = summarise(members.map((member) => member.value), aggregation);
        return [{
          ...point,
          y: summary.value,
          min: summary.min,
          max: summary.max,
          intervalLow: summary.intervalLow,
          intervalHigh: summary.intervalHigh,
          intervalLabel: summary.n > 1 ? summary.intervalLabel : "single value" as const,
          n: summary.n,
          members,
          selectedLabel: `${sample.sampleLabel} · ${sample.sampleReference}`,
        }];
      });
      return {
        ...series,
        id: `${series.id}::${sample.sampleUid}`,
        label: `${String.fromCharCode(65 + parentIndex)}${sampleIndex + 1} · ${sample.sampleLabel}`,
        points,
        contextLabel: [series.config.stress, METRICS[series.config.metric].label, sample.sampleUid, `Excel ref. ${sample.sampleReference}`, describeGraphElectrode([sampleMap.get(sample.sampleUid)?.electrode])].filter(Boolean).join(" · "),
        exportLabel: series.config.material,
        exportLegendKey: series.id,
        exportDetail: series.contextLabel,
        parentSeriesId: series.id,
        linePattern: SAMPLE_LINE_PATTERNS[sampleIndex % SAMPLE_LINE_PATTERNS.length],
      };
    })
  ));
  const displayedTrendSeries: ContextTrendSeries[] = trendDisplay === "samples"
    ? sampleTrendSeries
    : selectedTrendSeries;
  const visibleCurveSeries = curveSeries.filter((series) => !hiddenSeries.has(series.id));
  const visibleCurveSelections = curveSelections.filter((selection) => !hiddenSeries.has(selection.seriesId));
  const curveAudit = visibleCurveSelections.reduce((summary, selection) => {
    summary.raw += selection.analysis.rawPointCount;
    summary.primary += selection.analysis.primaryPointCount;
    summary.segments += selection.analysis.segments.length;
    return summary;
  }, { raw: 0, primary: 0, segments: 0 });
  const displayedPointCount = sweepView === "primary" ? curveAudit.primary : curveAudit.raw;
  const toggleSeries = (seriesId: SeriesId) => setHiddenSeries((current) => {
    const next = new Set(current);
    if (next.has(seriesId)) next.delete(seriesId);
    else next.add(seriesId);
    return next;
  });
  const toggleTrendRow = (rowKey: string) => setExpandedTrendRows((current) => {
    const next = new Set(current);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    return next;
  });
  const selectAllTrendSamples = (seriesId: SeriesId) => {
    setTrendDisplay("samples");
    setCohortMode("available");
    setHiddenSeries(new Set());
    setTrendSampleFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== seriesId)));
  };
  const toggleTrendSample = (seriesId: SeriesId, sampleId: string) => {
    const availableIds = (trendSampleOptions[seriesId] ?? []).map((member) => member.sampleUid);
    setTrendDisplay("samples");
    setCohortMode("available");
    setHiddenSeries(new Set());
    setTrendSampleFilters((current) => {
      const nextSelection = toggleSelectedSampleId(availableIds, current[seriesId], sampleId);
      if (nextSelection) return { ...current, [seriesId]: nextSelection };
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== seriesId));
    });
  };
  const sharedXUnit = trendSeries.length && trendSeries.every((series) => series.xUnit === trendSeries[0].xUnit) ? trendSeries[0].xUnit : null;
  const sharedMetric = seriesConfigs.length && seriesConfigs.every((config) => config.metric === seriesConfigs[0].metric) ? seriesConfigs[0].metric : null;
  const overlayCompatible = Boolean(sharedXUnit && sharedMetric && seriesConfigs.every((config) => config.stress === seriesConfigs[0].stress));
  const trendPanels = overlayCompatible
    ? [displayedTrendSeries]
    : trendSeries.map((parent) => displayedTrendSeries.filter((series) => series.parentSeriesId === parent.id));

  const trendInsight = (() => {
    if (trendDisplay === "samples") return {
      title: `${sampleTrendSeries.length} individual trajectories`,
      detail: "Each line follows one inventory specimen. Its relation to pixels/substrates is not fully adjudicated. Shared colours identify the material family.",
      time: null,
      count: sampleTrendSeries.reduce((total, series) => total + series.points.length, 0),
    };
    if (selectedTrendSeries.length < 2) return null;
    if (!overlayCompatible || !sharedXUnit) return {
      title: "Separate scales required",
      detail: "The selected series use different time units or absolute metrics. They are shown in separate panels to avoid a misleading shared axis.",
      time: null,
      count: selectedTrendSeries.reduce((total, series) => total + series.points.reduce((sum, point) => sum + point.n, 0), 0),
    };
    const commonTimes = selectedTrendSeries.reduce<number[]>((common, series, index) => {
      const times = new Set(series.points.map((point) => point.x));
      return index === 0 ? [...times] : common.filter((time) => times.has(time));
    }, []).sort((left, right) => left - right);
    const time = commonTimes[commonTimes.length - 1];
    if (!numeric(time)) return null;
    const points = selectedTrendSeries.map((series) => ({ series, point: series.points.find((point) => point.x === time)! }));
    const orderedValues = points.map((item) => item.point.y).sort((left, right) => left - right);
    const difference = orderedValues[orderedValues.length - 1] - orderedValues[0];
    const limitations = [
      selectedTrendSeries.some((series) => series.sampleSetChanges) ? "the contributing sample set changes over time" : null,
      points.some((item) => item.point.n < 2) ? "at least one aggregate contains a single sample" : null,
    ].filter(Boolean);
    return {
      title: `Latest shared duration: ${fr.format(time)} ${sharedXUnit}`,
      detail: `Observed aggregate spread: ${fr.format(difference)} ${mode === "retention" ? "retention points" : METRICS[points[0].series.config.metric].unit} across ${points.length} series. Descriptive comparison only${limitations.length ? ` because ${limitations.join(" and ")}` : "; no hypothesis test has been applied"}.`,
      time,
      count: points.reduce((total, item) => total + item.point.n, 0),
    };
  })();

  const exportTrend = () => {
    downloadFigureFile(fullSelectionCsv(figureContext), "iv-compare-full-selected.csv", "text/csv;charset=utf-8");
  };

  const report = dataset?.report;
  const outdoorIssueExample = relevantOutdoorIssues[0];
  const outdoorIssueSample = outdoorIssueExample ? sampleMap.get(outdoorIssueExample.sampleUid) : undefined;
  const comparisonCount = selectedTrendSeries.reduce((total, series) => total + series.points.reduce((sum, point) => sum + point.n, 0), 0);
  const removeSeriesChoices = (seriesId: SeriesId) => {
    setTrendSampleFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== seriesId)));
    setExpandedTrendRows((current) => new Set([...current].filter((rowKey) => !rowKey.startsWith(`${seriesId}:`))));
    setHiddenSeries((current) => new Set([...current].filter((key) => key !== seriesId)));
    setCurveMeasurementIds((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== seriesId)));
  };
  const updateSeriesConfig = (seriesId: string, patch: Partial<SeriesConfig>) => {
    if (!dataset) return;
    setSeriesConfigs((current) => current.map((config) => config.id === seriesId ? normalizeSeriesConfig(dataset, { ...config, ...patch }) : config));
  };
  const addComparisonMaterial = () => {
    if (!dataset || !seriesConfigs.length || seriesConfigs.length >= MAX_SERIES) return;
    const base = seriesConfigs[0];
    const id = `s${nextSeriesIdRef.current++}`;
    setSeriesConfigs((current) => [...current, normalizeSeriesConfig(dataset, { ...base, id })]);
  };
  const removeComparisonMaterial = (seriesId: string) => {
    setSeriesConfigs((current) => current.filter((config) => config.id !== seriesId));
    removeSeriesChoices(seriesId);
  };
  const aggregationHelp = {
    mean: "The mean uses every selected QA-valid sample. The chart and table report its 95% confidence interval; interpret intervals cautiously when n is small.",
    median: "The median summarises the selected QA-valid samples with an interquartile range. It is robust to extremes but does not replace inspection of individual values.",
  }[aggregation];

  const figureContext = {
    dataset: { name: dataset?.name, schemaVersion: dataset?.schemaVersion, provenance: dataset?.provenance, packageSha256: dataset ? datasetPackageHash(dataset) : null },
    sourceCode: buildIdentity,
    validation: { quantitativeValidated: curveSelections.length > 0 && curveSelections.every(selection => jvDiagnostics.get(selection.measurement.measurement_uid)?.quantitativeEligible) },
    filters: seriesConfigs,
    analysisTrace: Object.fromEntries(normalizationBySeries),
    selectedSamples: activeTrendSampleIds,
    missingness,
    qa: { includeFlagged: includeQa, inspectUnsafeJV },
    normalization: { mode, outdoorBaselineDays: outdoorWindow },
    aggregation: { method: aggregation, grouping },
    cohort: { mode: cohortMode, start: cohortStart, end: cohortEnd, diagnostics: cohortDiagnostics },
    seriesMetadata: Object.fromEntries(curveSelections.map(selection => [selection.seriesId, {
      measurement: selection.measurement, file: selection.file,
      diagnostics: jvDiagnostics.get(selection.measurement.measurement_uid),
    }])),
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">IV</div>
        <div>
          <p className="eyebrow">Internal tool · IV data</p>
          <h1>IV Compare</h1>
        </div>
        <div className={`dataset-pill ${loadState}`}><span /> {loadMessage}</div>
      </header>

      <section className="dataset-toolbar">
        <div className="dataset-stats" aria-label="Dataset summary">
          <div><strong>{report ? fr.format(report.samples) : "—"}</strong><span>samples</span></div>
          <div><strong>{report ? fr.format(report.measurements) : "—"}</strong><span>IV curves</span></div>
          <div><strong>{report ? `${fr.format(report.points / 1000)}k` : "—"}</strong><span>points</span></div>
        </div>
        <label className={`compact-import ${loadState === "loading" ? "busy" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <input ref={fileInputRef} type="file" multiple accept=".ivpack,.json,.gz,.xlsx,.tsv" aria-label="Import IV data" onChange={(event) => void processFiles(Array.from(event.target.files ?? []))} />
          <span className="import-action">Import data</span>
          <small>.ivpack or .xlsx + .tsv · processed locally</small>
        </label>
      </section>

      <section className="workspace-card" aria-busy={loadState === "loading"}>
        <div className="workspace-head">
          <div>
            <p className="eyebrow">Comparison workspace</p>
            <h3>{view === "curves" && curveComparison === "ageing" ? "IV evolution of one cell" : view === "encapsulation" ? "Before / after encapsulation" : sharedCurveStress ? (sharedCurveStress === "Unaged" ? "Initial-state comparison" : `Evolution after ${sharedCurveStress}`) : "Condition comparison"}</h3>
          </div>
          <div className="head-actions">
            <a className="soft-button" href="/data/iv-compare-dowsil.ivpack" download>Sample package</a>
            {view === "trend" && <button type="button" className="primary-button" onClick={exportTrend} disabled={!comparisonCount}>Full selected dataset CSV</button>}
          </div>
        </div>

        <div className="materials-panel">
          <div className="materials-panel-title"><FieldTitle help={`${HELP.polymer} ${HELP.addMaterial}`}>{view === "curves" && curveComparison === "ageing" ? "Material and ageing protocol" : "Comparison series"}</FieldTitle><span>{view === "curves" && curveComparison === "ageing" ? "1 material" : `${comparisonMaterials.length} series`}</span></div>
          <div className="material-selectors">
            {seriesConfigs.filter((_, index) => !(view === "curves" && curveComparison === "ageing") || index === 0).map((config, index) => {
              const stresses = dataset ? stressesForConfig(dataset, config) : [];
              const metrics = metricOptionsFor(config.stress);
              return <article className="material-selector series-config-card" key={config.id} style={{ borderTopColor: materialStyle(config.material).color }}>
                <div className="series-config-title"><span className="material-slot"><i style={{ background: materialStyle(config.material).color }} />Series {String.fromCharCode(65 + index)}</span>{index >= 2 ? <button type="button" className="remove-material" onClick={() => removeComparisonMaterial(config.id)} aria-label={`Remove series ${String.fromCharCode(65 + index)}`} title="Remove this series">×</button> : null}</div>
                <div className="series-config-grid">
                  <label>Encapsulant<select aria-label={`Series ${String.fromCharCode(65 + index)} encapsulant`} value={config.material} onChange={(event) => { updateSeriesConfig(config.id, { material: event.target.value }); setCurveAgeingSample(null); setCurveAgeingTimes([]); setCurveMeasurementIds({}); }}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
                  {view !== "encapsulation" && <label>Ageing protocol<select aria-label={`Series ${String.fromCharCode(65 + index)} ageing protocol`} value={config.stress} onChange={(event) => { updateSeriesConfig(config.id, { stress: event.target.value }); setCurveAgeingSample(null); setCurveAgeingTimes([]); setCurveMeasurementIds({}); }}>{stresses.map((item) => <option key={item}>{item}</option>)}</select></label>}
                  {view !== "encapsulation" && <label className="series-metric">Metric<select aria-label={`Series ${String.fromCharCode(65 + index)} metric`} value={config.metric} onChange={(event) => updateSeriesConfig(config.id, { metric: event.target.value as MetricKey })}>{metrics.map((key) => <option key={key} value={key}>{METRICS[key].label}</option>)}</select></label>}
                  {view !== "encapsulation" && ([['formulation','Formulation','material_raw'],['batch','Batch','batch_no_raw'],['recipe','Recipe','recipe_uid'],['electrode','Electrode','electrode']] as const).map(([field,label,source]) => <label key={field}>{label}<select aria-label={`Series ${String.fromCharCode(65 + index)} ${label.toLowerCase()}`} value={config[field] ?? "all"} onChange={(event) => updateSeriesConfig(config.id,{[field]:event.target.value})}><option value="all">All recorded values</option>{unique(dataset?.samples.filter((sample) => sample.material_family === config.material).map((sample) => sample[source]) ?? []).map((value) => <option key={value} value={value}>{field === "recipe" ? dataset?.recipes.find((recipe) => recipe.recipe_uid === value)?.recipe_raw || value : value}</option>)}</select></label>)}
                </div>
              </article>;
            })}
            {!(view === "curves" && curveComparison === "ageing") && <div className="add-material-wrap">
              <button type="button" className="add-material" onClick={addComparisonMaterial} disabled={!dataset || seriesConfigs.length >= MAX_SERIES}><span aria-hidden="true">+</span> Add series</button>
              <InfoTip text={seriesConfigs.length >= MAX_SERIES ? `A maximum of ${MAX_SERIES} series can be displayed.` : HELP.addMaterial} align="right" />
            </div>}
          </div>
        </div>

        {view !== "encapsulation" && <div className="control-row">
          <div className="segmented" aria-label="Value mode">
            <button className={mode === "retention" ? "active" : ""} onClick={() => setMode("retention")}>Retention</button>
            <button className={mode === "absolute" ? "active" : ""} onClick={() => setMode("absolute")}>Absolute value</button>
          </div>
          <InfoTip text={HELP.retention} align="left" />
          <div className="segmented" aria-label="Trend display">
            <button className={trendDisplay === "samples" ? "active" : ""} onClick={() => { setTrendDisplay("samples"); setCohortMode("available"); setHiddenSeries(new Set()); }}>Individual samples</button>
            <button className={trendDisplay === "aggregate" ? "active" : ""} onClick={() => { setTrendDisplay("aggregate"); setHiddenSeries(new Set()); }}>{aggregation === "mean" ? "Mean" : "Median"}</button>
          </div>
          <InfoTip text={HELP.traceDisplay} align="left" />
          <label className="inline-select"><FieldTitle help={aggregationHelp}>Aggregation</FieldTitle><select value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}><option value="mean">Mean + 95% CI</option><option value="median">Median + IQR</option></select></label>
          <span className="condition-group"><span className="condition-chip">Experimental metadata retained</span><InfoTip text={HELP.labConvention} /></span>
          <span className="check-item outdoor-quality-toggle"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> Include QA-flagged data{relevantOutdoorIssues.length ? ` (${relevantOutdoorIssues.length} outdoor)` : ""}</label><InfoTip text={`${HELP.qa} ${HELP.outdoorQa}`} align="right" /></span>
          <span className="quality-note">{report ? `${report.matchedFiles}/${report.files} files matched · ${report.reviewFiles} to resolve${report.auditFiles ? ` · ${report.auditFiles} reference/audit` : ""}` : ""}<InfoTip text={HELP.matching} align="right" /></span>
        </div>

        }
        {view === "trend" && <section className="control-row" aria-label="Scientific analysis controls">
          <label>Analysis grouping<select value={grouping} onChange={(event) => setGrouping(event.target.value as AnalysisGrouping)}><option value="conservative">Formulation + batch + recipe + electrode (default)</option><option value="material">Material family (explicit pooling)</option><option value="formulation">Formulation</option><option value="batch">Batch</option><option value="recipe">Recipe</option><option value="electrode">Electrode</option></select></label>
          <label>Cohort<select value={trendDisplay === "samples" ? "individual" : cohortMode} onChange={(event) => { const value = event.target.value; setCohortMode(value === "constant" ? "constant" : "available"); setTrendDisplay(value === "individual" ? "samples" : "aggregate"); }}><option value="available">Available observations</option><option value="constant">Constant cohort — diagnostic</option><option value="individual">Individual trajectories — no pooling</option></select></label>
          {cohortMode === "constant" && <><label>Window start<input type="number" value={cohortStart} onChange={(event) => setCohortStart(Number(event.target.value))}/></label><label>Window end<input type="number" value={cohortEnd} onChange={(event) => setCohortEnd(Number(event.target.value))}/></label><span role="status">Only specimens present at every recorded time within this window contribute. Missing final measurements are not zeros; omitted specimens remain in Available observations.</span></>}
          {seriesConfigs.some((config) => config.stress === "Outdoor") && <label>Outdoor reference<select value={outdoorWindow} onChange={(event) => setOutdoorWindow(Number(event.target.value) as 3 | 7 | 14)}><option value="7">B7 — primary convention (3–7 valid days)</option><option value="3">B3 — sensitivity</option><option value="14">B14 — sensitivity</option></select></label>}
          {grouping !== "conservative" && <span role="status">Explicit pooling: formulations, batches, recipes or electrodes may differ. Inspect composition below; this is not an isolated material effect.</span>}
        </section>}
        {view === "trend" && relevantLabIssues.size > 0 && <details style={{ margin: "12px 24px" }}><summary>Lab QA · {relevantLabIssues.size} flagged observations {includeQa ? "included" : "excluded from curves, aggregates and references"}</summary><ul>{[...relevantLabIssues].map(([id, reason]) => <li key={id}>{reason}</li>)}</ul></details>}
        {view === "trend" && trendDisplay === "aggregate" && aggregation === "mean" && <p style={{ margin: "12px 24px" }}>95% confidence intervals can be very wide with only two cells. They are not measured values or QA flags. Use individual samples or Median + IQR to inspect the spread.</p>}
        <nav className="view-tabs" aria-label="Chart type">
          <button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}><span>01</span> Performance over time</button>
          <button className={view === "curves" ? "active" : ""} onClick={() => setView("curves")}><span>02</span> IV curves</button>
          <button className={view === "encapsulation" ? "active" : ""} onClick={() => setView("encapsulation")}><span>03</span> Before / after encapsulation</button>
        </nav>

        {view === "encapsulation" ? <EncapsulationComparison dataset={dataset} selections={seriesConfigs.map((config) => ({ material: config.material, color: materialStyle(config.material).color }))} /> : view === "trend" ? (
          <div className="chart-layout">
            <section className="chart-card">
              <div className="chart-title">
                {displayedTrendSeries.map((series) => {
                  const hidden = hiddenSeries.has(series.id);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={series.id} aria-pressed={!hidden} onClick={() => toggleSeries(series.id)} title={`${hidden ? "Show" : "Hide"} ${series.label} · ${series.contextLabel} — calculations remain unchanged`}><svg className="legend-stroke" viewBox="0 0 24 8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" stroke={series.color} strokeWidth="3" strokeDasharray={series.linePattern} /></svg>{series.label}</button>;
                })}
                <span>{overlayCompatible ? "Shared scale" : "Separate scales"} <InfoTip text={overlayCompatible ? "The selected series share compatible axes and can be overlaid directly." : "Different time units or absolute metrics are displayed in separate panels to prevent a misleading comparison."} align="right" /></span>
              </div>
              <div className={`trend-panels ${overlayCompatible ? "overlay" : "split"}`}>
                {trendPanels.map((panel) => {
                  const first = panel[0];
                  if (!first) return null;
                  const visiblePanel = panel.filter((series) => !hiddenSeries.has(series.id));
                  const parent = trendSeries.find((series) => series.id === first.parentSeriesId);
                  const panelTitle = overlayCompatible ? (sharedMetric ? METRICS[sharedMetric].label : "Normalised retention") : `${parent?.label ?? first.label} · ${METRICS[first.config.metric].label}`;
                  const helpMetric = panel.length === 1 || sharedMetric ? (sharedMetric ?? first.config.metric) : null;
                  const reportMetric = METRICS[first.config.metric].label;
                  const reportAgeing = ageingReportLabel(first.config.stress);
                  const reportTitle = first.config.stress === "Unaged"
                    ? `${reportMetric} at the initial state`
                    : `${reportMetric}${mode === "retention" ? " retention" : ""} during ${reportAgeing}`;
                  const reportReference = first.config.stress === "Outdoor" ? "reference baseline" : "initial value";
                  const reportYAxisLabel = mode === "retention" ? `${reportMetric} retention (% of ${reportReference})` : `${reportMetric} (${first.yUnit})`;
                  const reportSubtitle = aggregation === "mean" ? "Mean with 95% CI when estimable" : "Median with IQR when estimable";
                  const panelKey = overlayCompatible ? `shared-${first.xUnit}` : `series-${first.parentSeriesId ?? first.id}-${first.xUnit}`;
                  return <section className="trend-panel" key={panelKey}>
                    <div className="trend-panel-head"><div><span className="trend-panel-title"><strong>{panelTitle}</strong>{helpMetric ? <InfoTip text={METRIC_HELP[helpMetric]} align="left" /> : null}</span><span className="trend-panel-context">{trendDisplay === "samples" ? `${panel.length} individual sample trajectories · ${first.xUnit}` : panel.length > 1 ? `${panel.length} compatible series · ${first.xUnit}` : first.contextLabel}</span></div></div>
                    <TrendChart series={visiblePanel.map((series) => ({ ...series, exportDetail: series.contextLabel }))} xUnit={first.xUnit} yUnit={first.yUnit} reportTitle={reportTitle} reportSubtitle={reportSubtitle} reportYAxisLabel={reportYAxisLabel} exportContext={figureContext} />
                  </section>;
                })}
              </div>
            </section>
            <aside className="insight-card">
              <p className="eyebrow">Quick read</p>
              <strong>{trendInsight?.title ?? "No common point yet"}</strong>
              <p>{trendInsight?.detail ?? "The selected series have no comparable duration under these filters."}</p>
              <dl>
                <div><dt>Observations <InfoTip text={HELP.observations} align="left" /></dt><dd>{comparisonCount}</dd></div>
                <div><dt>Mode <InfoTip text={HELP.retention} align="left" /></dt><dd>{mode === "retention" ? "normalised reference" : "absolute"}</dd></div>
                <div><dt>Display</dt><dd>{trendDisplay === "samples" ? "individual samples" : "aggregate trajectories"}</dd></div>
                <div><dt>Aggregation <InfoTip text={aggregationHelp} align="left" /></dt><dd>{trendDisplay === "samples" ? "within each patch" : { mean: "mean + 95% CI", median: "median + IQR" }[aggregation]}</dd></div>
              </dl>
              {outdoorIssueExample ? <div className="quality-alert" role="status"><strong>{relevantOutdoorIssues.length} outdoor anomal{relevantOutdoorIssues.length > 1 ? "ies" : "y"} {includeQa ? "included for review" : "excluded from analysis"}</strong><span>{outdoorIssueSample?.material_family ?? outdoorIssueExample.sampleUid}{numeric(outdoorIssueExample.time) ? ` · day ${fr.format(outdoorIssueExample.time)}` : ""}: {outdoorIssueExample.reason}{relevantOutdoorIssues.length > 1 ? ` ${relevantOutdoorIssues.length - 1} additional flagged value${relevantOutdoorIssues.length > 2 ? "s" : ""}.` : ""}</span></div> : null}
              {selectedTrendSeries.some((series) => series.sampleSetChanges || series.baselineWarnings.length) ? <p className="caution">{selectedTrendSeries.some((series) => series.sampleSetChanges) ? "The contributing sample set changes between some durations. " : ""}{selectedTrendSeries.flatMap((series) => series.baselineWarnings).slice(0, 2).join(" · ")}</p> : null}
            </aside>
            <section className="data-table-card">
              <details><summary>Missingness and analytical exclusions</summary>{missingness.map(group => <div key={group.seriesId}><h4>{group.protocol} · {group.metric}</h4><table><thead><tr><th>Specimen</th><th>Time</th><th>Status</th><th>Contributes</th><th>Reasons</th></tr></thead><tbody>{group.rows.map(row => <tr key={`${row.sampleUid}:${row.time}`}><td>{row.sampleUid}</td><td>{row.time}</td><td>{row.status}</td><td>{row.contributes ? "yes" : "no"}</td><td>{row.exclusionReasons.join("; ") || "—"}</td></tr>)}</tbody></table></div>)}</details>
              <details><summary>Cohort composition · n specimens / b batches at each time</summary>{cohortDiagnostics.map(({series,timeline}) => <div key={series.id}><h4>{series.label}</h4>{timeline.map((point) => <p key={point.time}><b>{point.time} {series.xUnit} · n={point.n} · b={point.batches.length}</b> · {point.sampleUids.join(", ")} {point.entered.length ? ` · entered: ${point.entered.join(", ")}` : ""}{point.left.length ? ` · no longer contributing: ${point.left.join(", ")}` : ""}{point.apparentRecoveryRisk ? " · Apparent recovery may reflect loss of low-performing specimens rather than performance recovery." : ""}</p>)}</div>)}</details>
              <div className="section-head">
                <div><p className="eyebrow">Aggregated values</p><h4>Displayed points</h4></div>
                <div className="table-head-tools">
                  <span>{trendDisplay === "samples" ? "Selected samples are drawn as separate trajectories." : `${aggregation === "mean" ? "95% CI" : "IQR"} · selected samples define each aggregate.`} <InfoTip text={`${HELP.traceDisplay} ${HELP.interval} ${HELP.replicates}`} align="right" /></span>
                  {trendSeries.map((series, seriesIndex) => {
                    const options = trendSampleOptions[series.id] ?? [];
                    const selectedIds = activeTrendSampleIds[series.id] ?? [];
                    const allSelected = selectedIds.length === options.length;
                    return <fieldset className="sample-filter" key={series.id} style={{ borderTopColor: series.color }}>
                      <legend>Samples {String.fromCharCode(65 + seriesIndex)} <InfoTip text={HELP.globalReplicate} align="right" /></legend>
                      <div className="sample-filter-options">
                        <button type="button" className={allSelected ? "active" : ""} onClick={() => selectAllTrendSamples(series.id)} disabled={allSelected}>All</button>
                        {options.map((member, index) => {
                          const checked = selectedIds.includes(member.sampleUid);
                          const lastSelected = checked && selectedIds.length === 1;
                          return <label className={checked ? "active" : ""} key={member.sampleUid} title={`${member.sampleLabel} · Excel ref. ${member.sampleReference}`}>
                            <input type="checkbox" checked={checked} disabled={lastSelected} onChange={() => toggleTrendSample(series.id, member.sampleUid)} />
                            <span>{index + 1}</span>
                            <small>{member.sampleLabel}</small>
                          </label>;
                        })}
                      </div>
                      <small className="sample-filter-summary">{selectedIds.length}/{options.length} selected · {trendDisplay === "aggregate" ? `${aggregation === "mean" ? "mean" : "median"} of selection` : "individual curves"}</small>
                    </fieldset>;
                  })}
                </div>
              </div>
              <div className="table-scroll"><table><thead><tr><th>Series / conditions</th><th>Sample / reference <InfoTip text={HELP.patchReference} align="left" /></th><th>Time</th><th>Plotted value</th><th>Interval low</th><th>Interval high</th><th>n</th></tr></thead><tbody>
                {displayedTrendSeries.flatMap((series) => series.points.map((point) => {
                  const rowKey = trendRowKey(series.id, point.x);
                  const expanded = expandedTrendRows.has(rowKey);
                  return <Fragment key={rowKey}>
                    <tr>
                      <td><b>{series.label}</b><small>{series.contextLabel}</small></td>
                      <td>{point.n === 1 ? point.members[0]?.sampleLabel : `${aggregation} · ${point.n} specimens`}</td>
                      <td>{fr.format(point.x)} {series.xUnit}</td>
                      <td>{fr.format(point.y)} {series.yUnit}</td>
                      <td>{point.n > 1 ? fr.format(point.intervalLow) : "—"}</td>
                      <td>{point.n > 1 ? fr.format(point.intervalHigh) : "—"}</td>
                      <td><button type="button" aria-expanded={expanded} onClick={() => toggleTrendRow(rowKey)}>{point.n}</button></td>
                    </tr>
                    {expanded && <tr><td colSpan={7}><strong>Contributing observations</strong><ul>{point.members.map(member => <li key={member.observationId}>{member.sampleUid} · {member.sampleLabel} · {member.observationId}: {fr.format(member.value)} {series.yUnit}{member.trace && <details><summary>Absolute value and reference</summary><p>Absolute: {member.trace.absoluteValue ?? "unavailable"} · baseline: {member.trace.baseline?.value ?? "not applicable"} · {member.trace.baseline?.definition ?? "absolute value"}</p><p>Source: {member.trace.observation.source_file} · row {member.trace.observation.source_row}. Reference observations: {member.trace.baseline?.observations.map(row=>row.observation_uid).join(", ") || "—"}</p></details>}</li>)}</ul></td></tr>}
                  </Fragment>;
                }))}
              </tbody></table></div>
            </section>
          </div>
        ) : (
          <div className="curve-workspace">
            <div className="segmented" aria-label="IV comparison mode">
              <button className={curveComparison === "ageing" ? "active" : ""} onClick={() => { setCurveComparison("ageing"); setHiddenSeries(new Set()); setCurveMeasurementIds({}); }}>One cell over ageing</button>
              <button className={curveComparison === "materials" ? "active" : ""} onClick={() => { setCurveComparison("materials"); setHiddenSeries(new Set()); setCurveMeasurementIds({}); }}>Materials at one time</button>
            </div>
            {curveComparison === "materials" && !sharedCurveStress ? <div className="missing-selection"><strong>IV curve overlay requires one shared ageing protocol.</strong><span>The performance view still compares these conditions in separate panels. Choose the same protocol in every series to overlay raw IV curves.</span></div> : <>
            <div className="curve-toolbar">
              {curveComparison === "materials" ? <label><FieldTitle help={HELP.targetTime}>Target time</FieldTitle><select value={resolvedCurveTime ?? ""} onChange={(event) => { setCurveTime(Number(event.target.value)); setCurveMeasurementIds({}); }} disabled={!selectableCurveTimes.length}>{selectableCurveTimes.length ? selectableCurveTimes.map((time) => <option key={time} value={time}>{fr.format(time)} {curveXUnit}{curveTimes.common.includes(time) ? " · exact for all series" : ""}</option>) : <option>No exact shared time available</option>}</select></label> : <label><FieldTitle help="Only cells with QA-valid raw IV curves at two or more exact stages are offered. Every curve belongs to this same physical cell.">Physical cell</FieldTitle><select aria-label="Physical cell for IV ageing" value={resolvedAgeingSample?.sampleUid ?? ""} disabled={!ageingCandidates.length} onChange={(event) => { setCurveAgeingSample(event.target.value); setCurveAgeingTimes([]); setCurveMeasurementIds({}); setHiddenSeries(new Set()); }}>{ageingCandidates.length ? ageingCandidates.map((candidate) => <option key={candidate.sampleUid} value={candidate.sampleUid}>{candidate.label} · {candidate.sampleUid} · {candidate.times.length} stages</option>) : <option>No cell with multiple exact IV stages</option>}</select></label>}
              <label><FieldTitle help={HELP.convention}>Current convention</FieldTitle><select value={currentConvention} onChange={(event) => setCurrentConvention(event.target.value as CurrentConvention)}><option value="instrument">Instrument · negative J</option><option value="pv">PV · positive generated J</option></select></label>
              <label><FieldTitle help={HELP.sweep}>Sweep</FieldTitle><select value={sweepView} onChange={(event) => setSweepView(event.target.value as SweepView)}><option value="primary">Primary · recommended</option><option value="all">All segments</option></select></label>
              <label><FieldTitle help={HELP.scale} align="right">Scale</FieldTitle><select value={curveScale} onChange={(event) => setCurveScale(event.target.value as CurveScale)}><option value="primary">Primary segments</option><option value="all">All data</option></select></label>
              <div className="curve-checks">
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={inspectUnsafeJV} onChange={(event) => setInspectUnsafeJV(event.target.checked)} /> Inspect unresolved JV data</label><InfoTip text="Includes curves with unresolved units, incomplete coverage or suspect export segments for inspection only. This does not validate their quantitative interpretation." /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showCurvePoints} onChange={(event) => setShowCurvePoints(event.target.checked)} /> Measured points</label><InfoTip text={HELP.rawPoints} align="left" /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showLandmarks} onChange={(event) => setShowLandmarks(event.target.checked)} /> IV landmarks</label><InfoTip text={HELP.landmarks} /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> QA-flagged measurements</label><InfoTip text={HELP.qa} align="right" /></span>
              </div>
            </div>
            <div className="curve-selection-grid" aria-label="IV measurement selection">
              {curveComparison === "ageing" && resolvedAgeingSample ? <div className="sample-filter-card" style={{ borderTopColor: materialStyle(seriesConfigs[0]?.material ?? "").color }}><strong>Ageing stages · same cell</strong><div className="sample-filter-options">{resolvedAgeingSample.times.map((candidate) => { const checked = selectedAgeingTimes.includes(candidate.time); return <label className={checked ? "active" : ""} key={candidate.time}><input type="checkbox" checked={checked} disabled={checked && selectedAgeingTimes.length <= 2} onChange={() => { setCurveAgeingTimes(toggleAgeingTime(selectedAgeingTimes, candidate.time)); setCurveMeasurementIds({}); setHiddenSeries(new Set()); }} /> {fr.format(candidate.time)} {timeUnit(seriesConfigs[0]?.stress ?? "")}</label>; })}</div><small>Choose at least two measured stages. 0 means Unaged after encapsulation, when an IV file is linked to this same cell.</small></div> : null}
              {(curveComparison === "ageing" ? ageingCurveSelections.map((selection) => ({ seriesId: selection.seriesId, color: selection.color, candidates: resolvedAgeingSample?.times.find((item) => item.time === selection.actualTime)?.measurements ?? [], title: `${fr.format(selection.actualTime)} ${timeUnit(selection.config.stress)} measurement` })) : curveCandidateGroups.map((group, index) => ({ ...group, title: `Series ${String.fromCharCode(65 + index)} measurement` }))).map((group, index) => <label key={group.seriesId} style={{ borderTopColor: group.color }}>
                <FieldTitle help={HELP.curveChoice} align={index === curveCandidateGroups.length - 1 ? "right" : "left"}>{group.title}</FieldTitle>
                <select value={curveMeasurementIds[group.seriesId] ?? "representative"} disabled={!group.candidates.length} onChange={(event) => setCurveMeasurementIds((current) => ({ ...current, [group.seriesId]: event.target.value === "representative" ? null : event.target.value }))}>
                  <option value="representative">Example cell · nearest specimen median efficiency</option>
                  {group.candidates.map((measurement) => {
                    const sample = measurement.sample_uid ? sampleMap.get(measurement.sample_uid) : undefined;
                    const efficiency = numeric(measurement.efficiency_pct) ? `${fr.format(measurement.efficiency_pct)}%` : "efficiency unavailable";
                    return <option value={measurement.measurement_uid} key={measurement.measurement_uid}>{sample?.sample_label ?? measurement.sample_uid ?? "Unmatched sample"} · {measurement.measurement_uid} · {efficiency}</option>;
                  })}
                  {!group.candidates.length ? <option>No QA-valid measurement at this exact time</option> : null}
                </select>
              </label>)}
            </div>
            <section className="chart-card curve-chart-card">
              <div className="chart-title">
                {curveSelections.map((selection) => {
                  const hidden = hiddenSeries.has(selection.seriesId);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={selection.seriesId} aria-pressed={!hidden} onClick={() => toggleSeries(selection.seriesId)} title={`${hidden ? "Show" : "Hide"} ${selection.material} — calculations remain unchanged`}><svg className="legend-stroke" viewBox="0 0 24 8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" stroke={selection.color} strokeWidth="3" strokeDasharray={selection.linePattern} /></svg>{curveComparison === "ageing" ? `${fr.format(selection.actualTime)} ${displayedCurveXUnit}` : `${selection.material} · ${fr.format(selection.actualTime)} ${displayedCurveXUnit}`}</button>;
                })}
                <span>{currentConvention === "instrument" ? "Instrument convention · negative photocurrent" : "PV convention · positive generated current"}</span>
              </div>
              {curveAudit.raw ? <div className={`curve-audit ${curveAudit.raw === curveAudit.primary ? "clean" : "segmented"}`} role="status"><span className="curve-audit-title"><strong>{displayedPointCount}/{curveAudit.raw} points displayed</strong><InfoTip text={HELP.pointAudit} align="left" /></span><span>{curveAudit.raw === curveAudit.primary ? "Continuous sweep" : `${curveAudit.raw - curveAudit.primary} additional points retained · ${curveAudit.segments} segments detected`}</span></div> : null}
              <CurveChart series={visibleCurveSeries} yAxisLabel={currentConvention === "instrument" ? "Instrument J (mA/cm²)" : "Generated J (mA/cm²)"} currentConvention={currentConvention} showPoints={showCurvePoints} showLandmarks={showLandmarks} scaleMode={curveScale} exportContext={figureContext} />
            </section>
            <div className="measurement-grid">
              {curveSelections.map((selection) => <article className="measurement-card" key={selection.seriesId} style={{ borderTopColor: selection.color }}>
                <p className="eyebrow">{selection.material}</p>
                <h4>{fr.format(selection.actualTime)} {displayedCurveXUnit} · {selection.measurement.measurement_uid}</h4>
                <JVDiagnosticDetails diagnostic={jvDiagnostics.get(selection.measurement.measurement_uid)} />
                <p className="measurement-selection-mode">{curveMeasurementIds[selection.seriesId] ? "Explicit measurement" : "Example cell nearest the specimen median efficiency"}</p>
                <dl>
                  <div><dt>Efficiency <InfoTip text={HELP.efficiency} align="left" /></dt><dd>{numeric(selection.measurement.efficiency_pct) ? `${fr.format(selection.measurement.efficiency_pct)} %` : "—"}</dd></div>
                  <div><dt>Voc <InfoTip text={HELP.voc} /></dt><dd>{numeric(selection.measurement.voc_V) ? `${fr.format(selection.measurement.voc_V)} V` : "—"}</dd></div>
                  <div><dt>Jsc <InfoTip text={HELP.jsc} /></dt><dd>{numeric(selection.measurement.jsc_mA_cm2) ? `${fr.format(selection.measurement.jsc_mA_cm2)} mA/cm²` : "—"}</dd></div>
                  <div><dt>FF <InfoTip text={HELP.ff} align="right" /></dt><dd>{numeric(selection.measurement.ff_pct) ? `${fr.format(selection.measurement.ff_pct)} %` : "—"}</dd></div>
                </dl>
                <p className="curve-segment-note">Primary segment: {selection.analysis.primaryPointCount}/{selection.analysis.rawPointCount} points · {selection.analysis.segments.length} segment{selection.analysis.segments.length > 1 ? "s" : ""} retained<InfoTip text={HELP.segmentation} align="right" /></p>
                <small>{sampleMap.get(selection.measurement.sample_uid ?? "")?.sample_label ?? selection.measurement.sample_uid ?? "Unmatched sample"} · {selection.file.source_file} · {selection.file.match_status}{numeric(selection.file.match_score) ? ` (${fr.format(selection.file.match_score)})` : ""}</small>
              </article>)}
              {!curveSelections.length ? <div className="missing-selection">No measurement matches these filters.</div> : null}
            </div>
            </>}
          </div>
        )}
      </section>

      <footer>
        <span>IV Compare · format .ivpack v{dataset?.schemaVersion ?? "1.0"}</span>
        <span>Extreme values remain available through the QA control.</span>
      </footer>
    </main>
  );
}

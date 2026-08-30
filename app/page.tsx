"use client";

import { DragEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CurveChart, CurveSeries, TrendChart, TrendPoint, TrendSeries } from "./components/Charts";
import { FieldTitle, InfoTip } from "./components/InfoTip";
import {
  Aggregation,
  aggregate,
  fetchDefaultDataset,
  importDatasetFiles,
  IVDataset,
  METRICS,
  MetricKey,
  Observation,
} from "./lib/iv-data";
import { analyzeIVCurve } from "./lib/iv-curve-analysis";
import {
  createInitialSeries,
  electrodesForConfig,
  metricOptionsFor,
  normalizeSeriesConfig,
  recipesForConfig,
  SeriesConfig,
  seriesSamplePasses,
  stressesForConfig,
} from "./lib/comparison";

const SERIES_COLORS = ["#ee735e", "#3469d4", "#2f9b72", "#9a62d4", "#d4932f", "#24a0ad", "#c84f83", "#68717e"];
const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const fr = numberFormat;
type View = "trend" | "curves";
type ValueMode = "absolute" | "retention";
type CurrentConvention = "instrument" | "pv";
type SweepView = "primary" | "all";
type CurveScale = "primary" | "all";
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
};

const METRIC_HELP: Record<MetricKey, string> = {
  efficiency_pct: "Efficiency is the maximum electrical power delivered divided by the incident light power. It combines the effects of Jsc, Voc, and fill factor.",
  jsc_mA_cm2: "Jsc is the short-circuit current density evaluated at V = 0. It mainly reflects the generation and collection of photogenerated charge carriers.",
  voc_V: "Voc is the open-circuit voltage measured when current is zero. It is sensitive to recombination losses and interface quality.",
  ff_pct: "Fill factor measures how rectangular the IV curve is: FF = Pmax / (Voc × Jsc). A decrease often indicates greater resistive or recombination losses.",
  outdoor_pr_pct: "Performance Ratio (PR) reported by the logger, summarised as the daily median of measurements recorded at irradiance levels of at least 200 W/m². This threshold excludes night-time and very low light levels, where the ratio becomes unstable.",
  outdoor_pmpp_W: "Power measured at the maximum power point outdoors. The daily maximum is shown to track each day’s best production capacity without removing the raw measurements from the workbook.",
  outdoor_irradiance_W_m2: "Incident solar irradiance. The daily maximum describes the available light level for that day and helps interpret Pmpp; by itself, it is not a measure of device stability.",
};

const HELP = {
  polymer: "Encapsulant polymer family associated with the sample in the inventory. To isolate its effect, keep the electrode and lamination recipe identical.",
  addMaterial: "Adds another independent comparison series. The same encapsulant can be selected more than once with a different electrode, recipe, ageing protocol, or metric.",
  ageing: "Applied ageing protocol: DH means damp heat, TC means thermal cycling, and Outdoor means outdoor exposure. Durations are comparable only within the same protocol.",
  electrode: "Device electrode metal. It can affect contacts, corrosion, and stability; mixing electrodes introduces a confounding factor.",
  recipe: "Lamination conditions associated with the sample: temperature, pressure, duration, and sequences. A different recipe can change adhesion, cross-linking, and IV performance.",
  retention: "Retention = value at time t / reference value for the same sample × 100. For DH/TC, the reference is the initial state. For Outdoor, the robust reference is the median of the logger’s first seven valid days for the selected metric.",
  conditions: "Each series owns its material, electrode, recipe, ageing protocol, and metric. ‘All’ mixes samples within that series; choose explicit conditions when you need an attributable comparison.",
  matching: "Matching links each IV file to an inventory sample using its metadata. Excluded files remain in the source dataset but do not participate in comparisons by default.",
  observations: "Total number of individual measurements contributing to the points currently shown. This is not the number of durations or averages.",
  minmax: "For each duration, the main line shows the aggregated value. Thin ranges cover the minimum and maximum retained observations.",
  replicates: "When n > 1, select n to open the individual observations. Choosing a sample changes only the plotted point; the aggregate, calculations, and exports remain unchanged.",
  globalReplicate: "Selectors A and B are independent: for example, you can plot sample 1 of polymer A against sample 2 of polymer B. Each choice maps to a specific sample reference from the Excel inventory. Durations without a measurement for that sample are not plotted. A row-level choice creates a local override.",
  patchReference: "Sample name and reference from the Excel inventory. In aggregate mode, the cell lists the samples contributing to the point; in individual mode, it identifies the exact plotted sample.",
  targetTime: "The site looks for this duration for every material. If there is no exact match, it uses the nearest available time and indicates it in the legend.",
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

function numeric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]): number {
  return aggregate(values, "median");
}

function outdoorQualityReason(observation: Observation, metric: MetricKey, peers: number[]): string | null {
  const value = observation[metric];
  if (!numeric(value)) return null;
  if (observation.data_quality_flag) return `Source QA flag: ${observation.data_quality_flag}`;
  if (metric === "outdoor_pr_pct" && (value < 0 || value > 150)) {
    return `PR of ${numberFormat.format(value)}% is outside the conservative 0–150% plausibility range.`;
  }
  if (metric === "outdoor_irradiance_W_m2" && (value < 0 || value > 1600)) {
    return `Irradiance of ${numberFormat.format(value)} W/m² is outside the conservative 0–1,600 W/m² sensor range.`;
  }
  if (metric === "outdoor_pmpp_W" && value < 0) return "Outdoor Pmpp cannot be negative.";
  if (peers.length < 14) return null;
  const centre = median(peers);
  if (centre <= 0) return null;
  const mad = median(peers.map((peer) => Math.abs(peer - centre)));
  const robustSigma = mad * 1.4826;
  const upperLimit = centre + Math.max(6 * robustSigma, centre * 1.5);
  if (value > upperLimit) {
    return `${numberFormat.format(value)} ${METRICS[metric].unit} is an extreme high-side spike (${numberFormat.format(value / centre)}× the ${numberFormat.format(centre)} ${METRICS[metric].unit} sample median).`;
  }
  return null;
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
  const [aggregation, setAggregation] = useState<Aggregation>("mean");
  const [includeQa, setIncludeQa] = useState(false);
  const [curveTime, setCurveTime] = useState<number | null>(null);
  const [currentConvention, setCurrentConvention] = useState<CurrentConvention>("instrument");
  const [sweepView, setSweepView] = useState<SweepView>("primary");
  const [curveScale, setCurveScale] = useState<CurveScale>("primary");
  const [showCurvePoints, setShowCurvePoints] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesId>>(() => new Set());
  const [expandedTrendRows, setExpandedTrendRows] = useState<Set<string>>(() => new Set());
  const [selectedTrendMembers, setSelectedTrendMembers] = useState<Record<string, string | null>>({});
  const [globalTrendSamples, setGlobalTrendSamples] = useState<Record<SeriesId, string | null>>({});
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
    setSelectedTrendMembers({});
    setGlobalTrendSamples({});
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
  const recipeMap = useMemo(() => new Map(dataset?.recipes.map((item) => [item.recipe_uid, item]) ?? []), [dataset]);
  const samplePasses = useCallback((sampleId: string | null | undefined, config: SeriesConfig) => dataset ? seriesSamplePasses(dataset, sampleId, config) : false, [dataset]);

  const outdoorQualityByMetric = useMemo(() => {
    const result = new Map<MetricKey, Map<string, OutdoorQualityIssue>>();
    if (!dataset) return result;
    (["outdoor_pr_pct", "outdoor_pmpp_W", "outdoor_irradiance_W_m2"] as MetricKey[]).forEach((metric) => {
      const issues = new Map<string, OutdoorQualityIssue>();
      const peersBySample = new Map<string, number[]>();
      dataset.observations.forEach((observation) => {
        const value = observation[metric];
        if (observation.test_type !== "Outdoor" || !numeric(value) || observation.data_quality_flag) return;
        const peers = peersBySample.get(observation.sample_uid) ?? [];
        peers.push(value);
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

  const relevantOutdoorIssues = useMemo(() => {
    const issues = new Map<string, OutdoorQualityIssue>();
    seriesConfigs.filter((config) => config.stress === "Outdoor").forEach((config) => {
      outdoorQualityByMetric.get(config.metric)?.forEach((issue) => {
        if (samplePasses(issue.sampleUid, config)) issues.set(issue.observationId, issue);
      });
    });
    return [...issues.values()];
  }, [seriesConfigs, outdoorQualityByMetric, samplePasses]);

  const trendSeries = useMemo<ContextTrendSeries[]>(() => {
    if (!dataset) return [];
    const observations = [...dataset.observations].sort((left, right) => (left.exposure_duration_numeric ?? Number.POSITIVE_INFINITY) - (right.exposure_duration_numeric ?? Number.POSITIVE_INFINITY));
    const baselineCache = new Map<string, number | null>();
    const baselineFor = (config: SeriesConfig, sampleUid: string): number | null => {
      const key = `${config.id}:${sampleUid}`;
      if (baselineCache.has(key)) return baselineCache.get(key) ?? null;
      if (config.stress === "Outdoor") {
        const qualityIssues = outdoorQualityByMetric.get(config.metric);
        const values = observations.filter((observation) => observation.sample_uid === sampleUid && observation.test_type === "Outdoor" && !qualityIssues?.has(observation.observation_uid)).map((observation) => observation[config.metric]).filter(numeric).slice(0, 7);
        const baseline = values.length ? aggregate(values, "median") : null;
        baselineCache.set(key, baseline);
        return baseline;
      }
      const baseline = observations.find((observation) => observation.sample_uid === sampleUid && observation.test_type === "Unaged" && numeric(observation[config.metric]))?.[config.metric];
      const value = numeric(baseline) ? baseline : null;
      baselineCache.set(key, value);
      return value;
    };
    const build = (config: SeriesConfig, index: number): ContextTrendSeries => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      const groups = new Map<number, TrendPoint["members"]>();
      dataset.observations.forEach((observation) => {
        if (observation.test_type !== config.stress || !samplePasses(observation.sample_uid, config)) return;
        const raw = observation[config.metric];
        if (!numeric(raw)) return;
        if (!includeQa && outdoorQualityByMetric.get(config.metric)?.has(observation.observation_uid)) return;
        const x = config.stress === "Unaged" ? 0 : observation.exposure_duration_numeric;
        if (!numeric(x)) return;
        let value = raw;
        if (mode === "retention") {
          const baseline = baselineFor(config, observation.sample_uid);
          if (!numeric(baseline) || baseline === 0) return;
          value = config.stress === "Unaged" ? 100 : (raw / baseline) * 100;
        }
        const members = groups.get(x) ?? [];
        const sample = sampleMap.get(observation.sample_uid);
        members.push({
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
        return {
          x,
          y: aggregate(values, aggregation),
          min: Math.min(...values),
          max: Math.max(...values),
          n: values.length,
          members: orderedMembers,
        };
      }).sort((a, b) => a.x - b.x);
      const recipeLabel = config.recipe === "all" ? "All recipes" : recipeMap.get(config.recipe)?.recipe_raw || config.recipe;
      const contextLabel = `${config.stress} · ${config.electrode === "all" ? "All electrodes" : config.electrode} · ${recipeLabel} · ${METRICS[config.metric].label}`;
      return { id: config.id, label: `${String.fromCharCode(65 + index)} · ${config.material}`, color, points, config, xUnit: timeUnit(config.stress), yUnit: mode === "retention" ? "% of reference" : METRICS[config.metric].unit, contextLabel };
    };
    return seriesConfigs.map(build);
  }, [dataset, seriesConfigs, mode, aggregation, samplePasses, sampleMap, includeQa, outdoorQualityByMetric, recipeMap]);

  const sharedCurveStress = seriesConfigs.length && seriesConfigs.every((config) => config.stress === seriesConfigs[0].stress) ? seriesConfigs[0].stress : null;
  const curveXUnit = sharedCurveStress ? timeUnit(sharedCurveStress) : "";
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

  const resolvedCurveTime = curveTimes.all.includes(curveTime as number) ? curveTime : curveTimes.common[curveTimes.common.length - 1] ?? curveTimes.all[curveTimes.all.length - 1] ?? null;

  const curveSelections = useMemo(() => {
    if (!dataset || resolvedCurveTime === null) return [];
    if (!sharedCurveStress) return [];
    const pick = (config: SeriesConfig, index: number) => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      const files = eligibleFiles(config).filter((file) => numeric(config.stress === "Unaged" ? 0 : file.inferred_exposure_duration));
      if (!files.length) return null;
      const distance = Math.min(...files.map((file) => Math.abs((config.stress === "Unaged" ? 0 : file.inferred_exposure_duration as number) - resolvedCurveTime)));
      const nearest = files.filter((file) => Math.abs((config.stress === "Unaged" ? 0 : file.inferred_exposure_duration as number) - resolvedCurveTime) === distance);
      const fileIds = new Set(nearest.map((file) => file.file_uid));
      const candidates = dataset.measurements
        .filter((measurement) => fileIds.has(measurement.file_uid) && (includeQa || !measurement.qa_flags) && dataset.curves[measurement.measurement_uid])
        .sort((left, right) => (right.efficiency_pct ?? -Infinity) - (left.efficiency_pct ?? -Infinity));
      const measurement = candidates[0];
      if (!measurement) return null;
      const file = nearest.find((item) => item.file_uid === measurement.file_uid)!;
      const curve = dataset.curves[measurement.measurement_uid];
      const points = curve.v.map((x, index) => ({ x, y: curve.j[index] }))
        .filter((point): point is { x: number; y: number } => numeric(point.x) && numeric(point.y));
      const analysis = analyzeIVCurve(points, measurement.voc_V);
      return {
        seriesId: config.id,
        material: config.material,
        config,
        color,
        measurement,
        file,
        actualTime: config.stress === "Unaged" ? 0 : file.inferred_exposure_duration as number,
        points,
        analysis,
      };
    };
    return seriesConfigs.map(pick).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [dataset, resolvedCurveTime, eligibleFiles, includeQa, seriesConfigs, sharedCurveStress]);

  const currentPolarity = currentConvention === "instrument" ? -1 : 1;
  const curveSeries: CurveSeries[] = curveSelections.map((selection) => ({
    id: selection.seriesId,
    label: `${String.fromCharCode(65 + seriesConfigs.findIndex((config) => config.id === selection.seriesId))} · ${selection.material}`,
    color: selection.color,
    segments: (sweepView === "primary"
      ? [selection.analysis.segments[selection.analysis.primaryIndex]]
      : selection.analysis.segments
    ).filter(Boolean).map((segment) => ({
      id: `${selection.measurement.measurement_uid}-${segment.id}`,
      isPrimary: segment.id === selection.analysis.segments[selection.analysis.primaryIndex]?.id,
      points: segment.points.map((point) => ({ x: point.x, y: point.y * currentPolarity, sourceIndex: point.sourceIndex })),
    })),
  }));
  const trendSampleOptions = Object.fromEntries(trendSeries.map((series) => {
    const byUid = new Map<string, TrendPoint["members"][number]>();
    series.points.forEach((point) => point.members.forEach((member) => {
      if (!byUid.has(member.sampleUid)) byUid.set(member.sampleUid, member);
    }));
    return [series.id, [...byUid.values()].sort((left, right) => left.sampleUid.localeCompare(right.sampleUid, "fr"))];
  })) as Record<SeriesId, TrendPoint["members"]>;
  const activeTrendSamples = Object.fromEntries(trendSeries.map((series) => [
    series.id,
    trendSampleOptions[series.id]?.some((member) => member.sampleUid === globalTrendSamples[series.id]) ? globalTrendSamples[series.id] : null,
  ])) as Record<SeriesId, string | null>;
  const resolveTrendSelection = (seriesId: SeriesId, point: TrendPoint) => {
    const rowKey = trendRowKey(seriesId, point.x);
    if (Object.prototype.hasOwnProperty.call(selectedTrendMembers, rowKey)) {
      const observationId = selectedTrendMembers[rowKey];
      const member = observationId ? point.members.find((item) => item.observationId === observationId) : undefined;
      return member ? { mode: "member" as const, member } : { mode: "aggregate" as const };
    }
    const sampleUid = activeTrendSamples[seriesId];
    if (!sampleUid) return { mode: "aggregate" as const };
    const member = point.members.find((item) => item.sampleUid === sampleUid);
    return member ? { mode: "member" as const, member } : { mode: "missing" as const };
  };
  const selectedTrendSeries = trendSeries.map((series) => ({
    ...series,
    points: series.points.flatMap((point) => {
      const selection = resolveTrendSelection(series.id, point);
      if (selection.mode === "missing") return [];
      return selection.mode === "member" ? [{
        ...point,
        y: selection.member.value,
        min: selection.member.value,
        max: selection.member.value,
        n: 1,
        selectedLabel: `${selection.member.sampleLabel} · ${selection.member.sampleReference}`,
      }] : [point];
    }),
  }));
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
  const selectTrendMember = (rowKey: string, observationId?: string) => setSelectedTrendMembers((current) => ({ ...current, [rowKey]: observationId ?? null }));
  const selectTrendSample = (seriesId: SeriesId, value: string) => {
    setGlobalTrendSamples((current) => ({ ...current, [seriesId]: value === "aggregate" ? null : value }));
    setSelectedTrendMembers((current) => Object.fromEntries(Object.entries(current).filter(([rowKey]) => !rowKey.startsWith(`${seriesId}:`))));
  };
  const sharedXUnit = trendSeries.length && trendSeries.every((series) => series.xUnit === trendSeries[0].xUnit) ? trendSeries[0].xUnit : null;
  const sharedMetric = seriesConfigs.length && seriesConfigs.every((config) => config.metric === seriesConfigs[0].metric) ? seriesConfigs[0].metric : null;
  const overlayCompatible = Boolean(sharedXUnit && (mode === "retention" || sharedMetric));
  const trendPanels = overlayCompatible ? [selectedTrendSeries] : selectedTrendSeries.map((series) => [series]);
  const conditionMixed = seriesConfigs.some((config) => config.electrode === "all" || config.recipe === "all");

  const trendInsight = (() => {
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
    const ranked = [...points].sort((left, right) => right.point.y - left.point.y);
    const difference = ranked[0].point.y - ranked[ranked.length - 1].point.y;
    return {
      title: `${ranked[0].series.label} leads at ${fr.format(time)} ${sharedXUnit}`,
      detail: `Max–min spread of ${fr.format(difference)} ${mode === "retention" ? "retention points" : METRICS[ranked[0].series.config.metric].unit} across ${points.length} series.`,
      time,
      count: points.reduce((total, item) => total + item.point.n, 0),
    };
  })();

  const exportTrend = () => {
    if (selectedTrendSeries.length < 2) return;
    const rows = [
      ["series", "material", "ageing_protocol", "electrode", "recipe", "metric", "time", "time_unit", "value", "value_unit", "n", "sample"],
      ...selectedTrendSeries.flatMap((series) => series.points.map((point) => [series.label, series.config.material, series.config.stress, series.config.electrode, series.config.recipe, METRICS[series.config.metric].label, point.x, series.xUnit, point.y, series.yUnit, point.n, point.selectedLabel ?? "Aggregate"])),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `condition-comparison-${comparisonMaterials.join("-")}.csv`.replaceAll(/[^a-zA-Z0-9.-]+/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  };

  const report = dataset?.report;
  const outdoorIssueExample = relevantOutdoorIssues[0];
  const outdoorIssueSample = outdoorIssueExample ? sampleMap.get(outdoorIssueExample.sampleUid) : undefined;
  const comparisonCount = selectedTrendSeries.reduce((total, series) => total + series.points.reduce((sum, point) => sum + point.n, 0), 0);
  const resetSeriesChoices = () => {
    setGlobalTrendSamples({});
    setSelectedTrendMembers({});
    setExpandedTrendRows(new Set());
    setHiddenSeries(new Set());
  };
  const updateSeriesConfig = (seriesId: string, patch: Partial<SeriesConfig>) => {
    if (!dataset) return;
    setSeriesConfigs((current) => current.map((config) => config.id === seriesId ? normalizeSeriesConfig(dataset, { ...config, ...patch }) : config));
    resetSeriesChoices();
  };
  const addComparisonMaterial = () => {
    if (!dataset || !seriesConfigs.length || seriesConfigs.length >= SERIES_COLORS.length) return;
    const base = seriesConfigs[0];
    const id = `s${nextSeriesIdRef.current++}`;
    setSeriesConfigs((current) => [...current, normalizeSeriesConfig(dataset, { ...base, id })]);
    resetSeriesChoices();
  };
  const removeComparisonMaterial = (seriesId: string) => {
    setSeriesConfigs((current) => current.filter((config) => config.id !== seriesId));
    resetSeriesChoices();
  };
  const aggregationHelp = {
    mean: "The mean uses every value and remains sensitive to extreme measurements.",
    median: "The median uses the central value and is more robust to extremes, but it can hide a bimodal distribution.",
    best: "The best value uses the maximum observed at each duration. It shows the achieved potential, not representative group behaviour.",
  }[aggregation];

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
            <h3>{sharedCurveStress ? (sharedCurveStress === "Unaged" ? "Initial-state comparison" : `Evolution after ${sharedCurveStress}`) : "Condition comparison"}</h3>
          </div>
          <div className="head-actions">
            <a className="soft-button" href="/data/iv-compare-dowsil.ivpack" download>Sample package</a>
            <button type="button" className="primary-button" onClick={exportTrend} disabled={!comparisonCount}>Export CSV</button>
          </div>
        </div>

        <div className="materials-panel">
          <div className="materials-panel-title"><FieldTitle help={`${HELP.polymer} ${HELP.addMaterial}`}>Comparison series</FieldTitle><span>{comparisonMaterials.length} series</span></div>
          <div className="material-selectors">
            {seriesConfigs.map((config, index) => {
              const electrodes = dataset ? electrodesForConfig(dataset, config) : [];
              const recipeIds = dataset ? recipesForConfig(dataset, config) : [];
              const stresses = dataset ? stressesForConfig(dataset, config) : [];
              const metrics = metricOptionsFor(config.stress);
              return <article className="material-selector series-config-card" key={config.id} style={{ borderTopColor: SERIES_COLORS[index % SERIES_COLORS.length] }}>
                <div className="series-config-title"><span className="material-slot"><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />Series {String.fromCharCode(65 + index)}</span>{index >= 2 ? <button type="button" className="remove-material" onClick={() => removeComparisonMaterial(config.id)} aria-label={`Remove series ${String.fromCharCode(65 + index)}`} title="Remove this series">×</button> : null}</div>
                <div className="series-config-grid">
                  <label>Encapsulant<select aria-label={`Series ${String.fromCharCode(65 + index)} encapsulant`} value={config.material} onChange={(event) => updateSeriesConfig(config.id, { material: event.target.value })}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Electrode<select aria-label={`Series ${String.fromCharCode(65 + index)} electrode`} value={config.electrode} onChange={(event) => updateSeriesConfig(config.id, { electrode: event.target.value })}><option value="all">All electrodes</option>{electrodes.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Recipe<select aria-label={`Series ${String.fromCharCode(65 + index)} recipe`} value={config.recipe} onChange={(event) => updateSeriesConfig(config.id, { recipe: event.target.value })}><option value="all">All recipes</option>{recipeIds.map((id) => <option key={id} value={id}>{recipeMap.get(id)?.recipe_raw || id}</option>)}</select></label>
                  <label>Ageing protocol<select aria-label={`Series ${String.fromCharCode(65 + index)} ageing protocol`} value={config.stress} onChange={(event) => updateSeriesConfig(config.id, { stress: event.target.value })}>{stresses.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="series-metric">Metric<select aria-label={`Series ${String.fromCharCode(65 + index)} metric`} value={config.metric} onChange={(event) => updateSeriesConfig(config.id, { metric: event.target.value as MetricKey })}>{metrics.map((key) => <option key={key} value={key}>{METRICS[key].label}</option>)}</select></label>
                </div>
              </article>;
            })}
            <div className="add-material-wrap">
              <button type="button" className="add-material" onClick={addComparisonMaterial} disabled={!dataset || seriesConfigs.length >= SERIES_COLORS.length}><span aria-hidden="true">+</span> Add series</button>
              <InfoTip text={seriesConfigs.length >= SERIES_COLORS.length ? `A maximum of ${SERIES_COLORS.length} series can be displayed.` : HELP.addMaterial} align="right" />
            </div>
          </div>
        </div>

        <div className="control-row">
          <div className="segmented" aria-label="Value mode">
            <button className={mode === "retention" ? "active" : ""} onClick={() => setMode("retention")}>Retention</button>
            <button className={mode === "absolute" ? "active" : ""} onClick={() => setMode("absolute")}>Absolute value</button>
          </div>
          <InfoTip text={HELP.retention} align="left" />
          <label className="inline-select"><FieldTitle help={aggregationHelp}>Aggregation</FieldTitle><select value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}><option value="mean">Mean</option><option value="median">Median</option><option value="best">Best value</option></select></label>
          <span className="condition-group"><span className={`condition-chip ${conditionMixed ? "warning" : "ok"}`}>{conditionMixed ? "Mixed conditions" : "Aligned conditions"}</span><InfoTip text={HELP.conditions} /></span>
          {relevantOutdoorIssues.length ? <span className="check-item outdoor-quality-toggle"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> Include {relevantOutdoorIssues.length} flagged outdoor point{relevantOutdoorIssues.length > 1 ? "s" : ""}</label><InfoTip text={HELP.outdoorQa} align="right" /></span> : null}
          <span className="quality-note">{report ? `${report.matchedFiles}/${report.files} files matched · ${report.reviewFiles} excluded` : ""}<InfoTip text={HELP.matching} align="right" /></span>
        </div>

        <nav className="view-tabs" aria-label="Chart type">
          <button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}><span>01</span> Performance over time</button>
          <button className={view === "curves" ? "active" : ""} onClick={() => setView("curves")}><span>02</span> IV curves</button>
        </nav>

        {view === "trend" ? (
          <div className="chart-layout">
            <section className="chart-card">
              <div className="chart-title">
                {trendSeries.map((series) => {
                  const hidden = hiddenSeries.has(series.id);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={series.id} aria-pressed={!hidden} onClick={() => toggleSeries(series.id)} title={`${hidden ? "Show" : "Hide"} ${series.label} · ${series.contextLabel} — calculations remain unchanged`}><span className="legend-dot" style={{ background: series.color }} />{series.label}</button>;
                })}
                <span>{overlayCompatible ? "Shared scale" : "Separate scales"} <InfoTip text={overlayCompatible ? "The selected series share compatible axes and can be overlaid directly." : "Different time units or absolute metrics are displayed in separate panels to prevent a misleading comparison."} align="right" /></span>
              </div>
              <div className={`trend-panels ${overlayCompatible ? "overlay" : "split"}`}>
                {trendPanels.map((panel) => {
                  const first = panel[0];
                  if (!first) return null;
                  const visiblePanel = panel.filter((series) => !hiddenSeries.has(series.id));
                  const panelTitle = panel.length > 1 ? (sharedMetric ? METRICS[sharedMetric].label : "Normalised retention") : `${first.label} · ${METRICS[first.config.metric].label}`;
                  const helpMetric = panel.length === 1 || sharedMetric ? (sharedMetric ?? first.config.metric) : null;
                  return <section className="trend-panel" key={panel.map((series) => series.id).join("-")}>
                    <div className="trend-panel-head"><div><span className="trend-panel-title"><strong>{panelTitle}</strong>{helpMetric ? <InfoTip text={METRIC_HELP[helpMetric]} align="left" /> : null}</span><span className="trend-panel-context">{panel.length > 1 ? `${panel.length} compatible series · ${first.xUnit}` : first.contextLabel}</span></div></div>
                    <TrendChart key={`${panel.map((series) => `${series.id}-${series.config.stress}-${series.config.metric}`).join("|")}-${mode}-${aggregation}-${includeQa}`} series={visiblePanel} xUnit={first.xUnit} yUnit={first.yUnit} />
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
                <div><dt>Aggregation <InfoTip text={aggregationHelp} align="left" /></dt><dd>{{ mean: "mean", median: "median", best: "best" }[aggregation]}</dd></div>
              </dl>
              {outdoorIssueExample ? <div className="quality-alert" role="status"><strong>{relevantOutdoorIssues.length} outdoor anomal{relevantOutdoorIssues.length > 1 ? "ies" : "y"} {includeQa ? "included for review" : "excluded from analysis"}</strong><span>{outdoorIssueSample?.material_family ?? outdoorIssueExample.sampleUid}{numeric(outdoorIssueExample.time) ? ` · day ${fr.format(outdoorIssueExample.time)}` : ""}: {outdoorIssueExample.reason}{relevantOutdoorIssues.length > 1 ? ` ${relevantOutdoorIssues.length - 1} additional flagged value${relevantOutdoorIssues.length > 2 ? "s" : ""}.` : ""}</span></div> : null}
              {conditionMixed ? <p className="caution">At least one series mixes electrodes or recipes. Select explicit conditions in each series before attributing a difference to the encapsulant.</p> : null}
            </aside>
            <section className="data-table-card">
              <div className="section-head">
                <div><p className="eyebrow">Aggregated values</p><h4>Displayed points</h4></div>
                <div className="table-head-tools">
                  <span>Min–max · select n to view samples. <InfoTip text={`${HELP.minmax} ${HELP.replicates}`} align="right" /></span>
                  {trendSeries.map((series, seriesIndex) => <label className="inline-select patch-select" key={series.id}><FieldTitle help={HELP.globalReplicate} align="right">Sample {String.fromCharCode(65 + seriesIndex)}</FieldTitle><select value={activeTrendSamples[series.id] ?? "aggregate"} onChange={(event) => selectTrendSample(series.id, event.target.value)} style={{ borderLeftColor: series.color }}><option value="aggregate">Aggregate · all</option>{(trendSampleOptions[series.id] ?? []).map((member, index) => <option key={member.sampleUid} value={member.sampleUid}>Sample {index + 1} · {member.sampleLabel} · {member.sampleReference}</option>)}</select></label>)}
                </div>
              </div>
              <div className="table-scroll"><table><thead><tr><th>Series / conditions</th><th>Sample / reference <InfoTip text={HELP.patchReference} align="left" /></th><th>Time</th><th>Plotted value</th><th>Min</th><th>Max</th><th>n</th></tr></thead><tbody>
                {trendSeries.flatMap((series) => series.points.map((point) => {
                  const rowKey = trendRowKey(series.id, point.x);
                  const expanded = expandedTrendRows.has(rowKey);
                  const selection = resolveTrendSelection(series.id, point);
                  const selectedMember = selection.mode === "member" ? selection.member : undefined;
                  const selectedId = selectedMember?.observationId;
                  const globalTarget = activeTrendSamples[series.id] ? trendSampleOptions[series.id].find((member) => member.sampleUid === activeTrendSamples[series.id]) : undefined;
                  return <Fragment key={rowKey}>
                    <tr className={selection.mode === "missing" ? "patch-unavailable" : selectedId ? "individual-selected" : ""}>
                      <td><span className="patch-reference"><b><span className="table-dot" style={{ background: series.color }} />{series.label}</b><small>{series.contextLabel}</small></span></td>
                      <td>{selection.mode === "member" ? <span className="patch-reference"><b>{selectedMember!.sampleLabel}</b><small>Excel ref.: {selectedMember!.sampleReference}{selectedMember!.batchNo ? ` · batch ${selectedMember!.batchNo}` : ""}</small></span> : selection.mode === "missing" ? <span className="patch-reference"><b>No measurement at this duration</b><small>{globalTarget?.sampleLabel} · {globalTarget?.sampleReference}</small></span> : <span className="patch-reference"><b>Aggregate · {point.n} sample{point.n > 1 ? "s" : ""}</b><small>{point.members.map((member) => `${member.sampleLabel} (${member.sampleReference})`).join(" · ")}</small></span>}</td>
                      <td>{fr.format(point.x)} {series.xUnit}</td>
                      <td>{selection.mode === "missing" ? "—" : <><b>{fr.format(selectedMember?.value ?? point.y)}</b> {series.yUnit}</>}</td>
                      <td>{selection.mode === "aggregate" ? fr.format(point.min) : "—"}</td>
                      <td>{selection.mode === "aggregate" ? fr.format(point.max) : "—"}</td>
                      <td>{point.n > 1 ? <button type="button" className="n-toggle" aria-expanded={expanded} onClick={() => toggleTrendRow(rowKey)} title="Show individual observations">{point.n}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : point.n}</td>
                    </tr>
                    {expanded ? <tr className="replicate-detail-row"><td colSpan={7}>
                      <div className="replicate-panel">
                        <div className="replicate-heading"><strong>Value used on the chart</strong><span>{activeTrendSamples[series.id] ? `Global selection ${series.id.toUpperCase()}: ${globalTarget?.sampleLabel}. A choice here creates a local override.` : "The table uses the reference aggregate."}</span></div>
                        <div className="replicate-choices">
                          <button type="button" className={`replicate-choice ${selection.mode === "aggregate" ? "active" : ""}`} aria-pressed={selection.mode === "aggregate"} onClick={() => selectTrendMember(rowKey)} style={{ borderLeftColor: series.color }}><span><b>Aggregate</b><small>{{ mean: "Mean", median: "Median", best: "Best value" }[aggregation]} · n={point.n}</small></span><strong>{fr.format(point.y)} {series.yUnit}</strong></button>
                          {point.members.map((member, index) => <button type="button" className={`replicate-choice ${selectedId === member.observationId ? "active" : ""}`} aria-pressed={selectedId === member.observationId} key={member.observationId} onClick={() => selectTrendMember(rowKey, member.observationId)} style={{ borderLeftColor: series.color }}><span><b>Sample {index + 1} · {member.sampleLabel}</b><small>Excel ref.: {member.sampleReference}{member.batchNo ? ` · batch ${member.batchNo}` : ""} · {member.observationId}</small></span><strong>{fr.format(member.value)} {series.yUnit}</strong></button>)}
                        </div>
                      </div>
                    </td></tr> : null}
                  </Fragment>;
                }))}
              </tbody></table></div>
            </section>
          </div>
        ) : (
          <div className="curve-workspace">
            {!sharedCurveStress ? <div className="missing-selection"><strong>IV curve overlay requires one shared ageing protocol.</strong><span>The performance view still compares these conditions in separate panels. Choose the same protocol in every series to overlay raw IV curves.</span></div> : <>
            <div className="curve-toolbar">
              <label><FieldTitle help={HELP.targetTime}>Target time</FieldTitle><select value={resolvedCurveTime ?? ""} onChange={(event) => setCurveTime(Number(event.target.value))} disabled={!curveTimes.all.length}>{curveTimes.all.length ? curveTimes.all.map((time) => <option key={time} value={time}>{fr.format(time)} {curveXUnit}{curveTimes.common.includes(time) ? " · common" : ""}</option>) : <option>No time available</option>}</select></label>
              <label><FieldTitle help={HELP.convention}>Current convention</FieldTitle><select value={currentConvention} onChange={(event) => setCurrentConvention(event.target.value as CurrentConvention)}><option value="instrument">Instrument · negative J</option><option value="pv">PV · positive generated J</option></select></label>
              <label><FieldTitle help={HELP.sweep}>Sweep</FieldTitle><select value={sweepView} onChange={(event) => setSweepView(event.target.value as SweepView)}><option value="primary">Primary · recommended</option><option value="all">All segments</option></select></label>
              <label><FieldTitle help={HELP.scale} align="right">Scale</FieldTitle><select value={curveScale} onChange={(event) => setCurveScale(event.target.value as CurveScale)}><option value="primary">Primary segments</option><option value="all">All data</option></select></label>
              <div className="curve-checks">
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showCurvePoints} onChange={(event) => setShowCurvePoints(event.target.checked)} /> Measured points</label><InfoTip text={HELP.rawPoints} align="left" /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showLandmarks} onChange={(event) => setShowLandmarks(event.target.checked)} /> IV landmarks</label><InfoTip text={HELP.landmarks} /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> QA-flagged measurements</label><InfoTip text={HELP.qa} align="right" /></span>
              </div>
            </div>
            <section className="chart-card curve-chart-card">
              <div className="chart-title">
                {curveSelections.map((selection) => {
                  const hidden = hiddenSeries.has(selection.seriesId);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={selection.seriesId} aria-pressed={!hidden} onClick={() => toggleSeries(selection.seriesId)} title={`${hidden ? "Show" : "Hide"} ${selection.material} — calculations remain unchanged`}><span className="legend-dot" style={{ background: selection.color }} />{selection.material} · {fr.format(selection.actualTime)} {curveXUnit}</button>;
                })}
                <span>{currentConvention === "instrument" ? "Instrument convention · negative photocurrent" : "PV convention · positive generated current"}</span>
              </div>
              {curveAudit.raw ? <div className={`curve-audit ${curveAudit.raw === curveAudit.primary ? "clean" : "segmented"}`} role="status"><span className="curve-audit-title"><strong>{displayedPointCount}/{curveAudit.raw} points displayed</strong><InfoTip text={HELP.pointAudit} align="left" /></span><span>{curveAudit.raw === curveAudit.primary ? "Continuous sweep" : `${curveAudit.raw - curveAudit.primary} additional points retained · ${curveAudit.segments} segments detected`}</span></div> : null}
              <CurveChart series={visibleCurveSeries} yAxisLabel={currentConvention === "instrument" ? "Instrument J (mA/cm²)" : "Generated J (mA/cm²)"} currentConvention={currentConvention} showPoints={showCurvePoints} showLandmarks={showLandmarks} scaleMode={curveScale} />
            </section>
            <div className="measurement-grid">
              {curveSelections.map((selection) => <article className="measurement-card" key={selection.seriesId} style={{ borderTopColor: selection.color }}>
                <p className="eyebrow">{selection.material}</p>
                <h4>{fr.format(selection.actualTime)} {curveXUnit} · {selection.measurement.measurement_uid}</h4>
                <dl>
                  <div><dt>Efficiency <InfoTip text={HELP.efficiency} align="left" /></dt><dd>{numeric(selection.measurement.efficiency_pct) ? `${fr.format(selection.measurement.efficiency_pct)} %` : "—"}</dd></div>
                  <div><dt>Voc <InfoTip text={HELP.voc} /></dt><dd>{numeric(selection.measurement.voc_V) ? `${fr.format(selection.measurement.voc_V)} V` : "—"}</dd></div>
                  <div><dt>Jsc <InfoTip text={HELP.jsc} /></dt><dd>{numeric(selection.measurement.jsc_mA_cm2) ? `${fr.format(selection.measurement.jsc_mA_cm2)} mA/cm²` : "—"}</dd></div>
                  <div><dt>FF <InfoTip text={HELP.ff} align="right" /></dt><dd>{numeric(selection.measurement.ff_pct) ? `${fr.format(selection.measurement.ff_pct)} %` : "—"}</dd></div>
                </dl>
                <p className="curve-segment-note">Primary segment: {selection.analysis.primaryPointCount}/{selection.analysis.rawPointCount} points · {selection.analysis.segments.length} segment{selection.analysis.segments.length > 1 ? "s" : ""} retained<InfoTip text={HELP.segmentation} align="right" /></p>
                <small>{selection.file.source_file}</small>
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

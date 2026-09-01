"use client";

import { DragEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CurveChart, CurveSeries, TrendChart, TrendPoint, TrendSeries } from "./components/Charts";
import { FieldTitle, InfoTip } from "./components/InfoTip";
import {
  Aggregation,
  fetchDefaultDataset,
  importDatasetFiles,
  IVDataset,
  METRICS,
  MetricKey,
} from "./lib/iv-data";
import { analyzeIVCurve } from "./lib/iv-curve-analysis";
import {
  chooseRepresentativeMeasurement,
  measurementQualityReasons,
  numeric,
  outdoorBaseline,
  outdoorQualityReason,
  summarise,
  TimedValue,
} from "./lib/science";
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
  baselineWarnings: string[];
  sampleSetChanges: boolean;
};

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
  polymer: "Encapsulant polymer family associated with the sample in the inventory. To isolate its effect, keep the electrode and lamination recipe identical.",
  addMaterial: "Adds another independent comparison series. The same encapsulant can be selected more than once with a different electrode, recipe, ageing protocol, or metric.",
  ageing: "Applied ageing protocol: DH means damp heat, TC means thermal cycling, and Outdoor means outdoor exposure. Durations are comparable only within the same protocol.",
  electrode: "Device electrode metal. It can affect contacts, corrosion, and stability; mixing electrodes introduces a confounding factor.",
  recipe: "Lamination conditions associated with the sample: temperature, pressure, duration, and sequences. A different recipe can change adhesion, cross-linking, and IV performance.",
  retention: "Retention = value at time t / reference value for the same sample × 100. For DH/TC, the reference is the initial state. For Outdoor, at least three valid days are required and the reference is the median of up to the first seven valid days. Sensitivity to 3-, 7-, and 14-day windows is reported when possible.",
  conditions: "Each series owns its material, electrode, recipe, ageing protocol, and metric. ‘All’ mixes samples within that series; choose explicit conditions when you need an attributable comparison.",
  matching: "Matching links each IV file to an inventory sample using its metadata. Excluded files remain in the source dataset but do not participate in comparisons by default.",
  observations: "Total number of individual measurements contributing to the points currently shown. This is not the number of durations or averages.",
  interval: "For each duration, the main line shows the selected aggregate. Mean values carry a 95% confidence interval; median values carry an interquartile range. Min and max remain available in the export.",
  replicates: "When n > 1, select n to open the individual observations. Choosing a sample changes only the plotted point; the aggregate, calculations, and exports remain unchanged.",
  globalReplicate: "Selectors A and B are independent: for example, you can plot sample 1 of polymer A against sample 2 of polymer B. Each choice maps to a specific sample reference from the Excel inventory. Durations without a measurement for that sample are not plotted. A row-level choice creates a local override.",
  patchReference: "Sample name and reference from the Excel inventory. In aggregate mode, the cell lists the samples contributing to the point; in individual mode, it identifies the exact plotted sample.",
  targetTime: "Only measurements acquired at this exact ageing duration are eligible. This prevents curves from different ageing times being overlaid as if they were equivalent.",
  curveChoice: "Representative selects the QA-valid curve whose efficiency is closest to the median of the eligible measurements. Choose a named measurement to make the selection fully explicit; the site never selects the maximum efficiency automatically.",
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
    setSelectedTrendMembers({});
    setGlobalTrendSamples({});
    setCurveMeasurementIds({});
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
  const observationMap = useMemo(() => new Map(dataset?.observations.map((item) => [item.observation_uid, item]) ?? []), [dataset]);
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
    const baselineCache = new Map<string, ReturnType<typeof outdoorBaseline>>();
    const baselineFor = (config: SeriesConfig, sampleUid: string): ReturnType<typeof outdoorBaseline> => {
      const key = `${config.id}:${sampleUid}`;
      if (baselineCache.has(key)) return baselineCache.get(key)!;
      if (config.stress === "Outdoor") {
        const qualityIssues = outdoorQualityByMetric.get(config.metric);
        const values = observations.filter((observation) => observation.sample_uid === sampleUid && observation.test_type === "Outdoor" && !qualityIssues?.has(observation.observation_uid)).map((observation) => observation[config.metric]).filter(numeric).slice(0, 14);
        const baseline = outdoorBaseline(values);
        baselineCache.set(key, baseline);
        return baseline;
      }
      const baseline = observations.find((observation) => observation.sample_uid === sampleUid && observation.test_type === "Unaged" && numeric(observation[config.metric]))?.[config.metric];
      const value = numeric(baseline) ? baseline : null;
      const result = { value, count: value === null ? 0 : 1, sensitivityPct: null };
      baselineCache.set(key, result);
      return result;
    };
    const build = (config: SeriesConfig, index: number): ContextTrendSeries => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      const groups = new Map<number, TrendPoint["members"]>();
      const baselineWarnings = new Set<string>();
      dataset.observations.forEach((observation) => {
        if (observation.test_type !== config.stress || !samplePasses(observation.sample_uid, config)) return;
        const raw = observation[config.metric];
        if (!numeric(raw)) return;
        if (!includeQa && (observation.data_quality_flag || outdoorQualityByMetric.get(config.metric)?.has(observation.observation_uid))) return;
        const x = config.stress === "Unaged" ? 0 : observation.exposure_duration_numeric;
        if (!numeric(x)) return;
        let value = raw;
        if (mode === "retention") {
          const baseline = baselineFor(config, observation.sample_uid);
          if (!numeric(baseline.value) || baseline.value === 0) return;
          if (numeric(baseline.sensitivityPct) && baseline.sensitivityPct > 5) baselineWarnings.add(`${observation.sample_uid}: ${numberFormat.format(baseline.sensitivityPct)}% baseline-window sensitivity`);
          value = config.stress === "Unaged" ? 100 : (raw / baseline.value) * 100;
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
      const recipeLabel = config.recipe === "all" ? "All recipes" : recipeMap.get(config.recipe)?.recipe_raw || config.recipe;
      const contextLabel = `${config.stress} · ${config.electrode === "all" ? "All electrodes" : config.electrode} · ${recipeLabel} · ${METRICS[config.metric].label}`;
      return { id: config.id, label: `${String.fromCharCode(65 + index)} · ${config.material}`, color, points, config, xUnit: timeUnit(config.stress), yUnit: mode === "retention" ? "% of reference" : METRICS[config.metric].unit, contextLabel, baselineWarnings: [...baselineWarnings], sampleSetChanges: signatures.size > 1 };
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

  const selectableCurveTimes = curveTimes.common.length ? curveTimes.common : curveTimes.all;
  const resolvedCurveTime = selectableCurveTimes.includes(curveTime as number) ? curveTime : selectableCurveTimes[selectableCurveTimes.length - 1] ?? null;

  const curveCandidateGroups = useMemo(() => {
    if (!dataset || resolvedCurveTime === null) return [];
    if (!sharedCurveStress) return [];
    return seriesConfigs.map((config, index) => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      const files = eligibleFiles(config).filter((file) => (config.stress === "Unaged" ? 0 : file.inferred_exposure_duration) === resolvedCurveTime);
      const fileIds = new Set(files.map((file) => file.file_uid));
      const candidates = dataset.measurements
        .filter((measurement) => fileIds.has(measurement.file_uid) && dataset.curves[measurement.measurement_uid] && (includeQa || measurementQualityReasons(measurement).length === 0))
        .sort((left, right) => left.measurement_uid.localeCompare(right.measurement_uid));
      return { seriesId: config.id, material: config.material, config, color, files, candidates };
    });
  }, [dataset, resolvedCurveTime, eligibleFiles, includeQa, seriesConfigs, sharedCurveStress]);

  const curveSelections = useMemo(() => curveCandidateGroups.flatMap((group) => {
      if (!dataset) return [];
      const requested = curveMeasurementIds[group.seriesId];
      const measurement = requested
        ? group.candidates.find((candidate) => candidate.measurement_uid === requested) ?? chooseRepresentativeMeasurement(group.candidates)
        : chooseRepresentativeMeasurement(group.candidates);
      if (!measurement) return [];
      const file = group.files.find((item) => item.file_uid === measurement.file_uid);
      if (!file) return [];
      const curve = dataset.curves[measurement.measurement_uid];
      const points = curve.v.map((x, index) => ({ x, y: curve.j[index] }))
        .filter((point): point is { x: number; y: number } => numeric(point.x) && numeric(point.y));
      const analysis = analyzeIVCurve(points, measurement.voc_V);
      return [{
        seriesId: group.seriesId,
        material: group.material,
        config: group.config,
        color: group.color,
        measurement,
        file,
        actualTime: group.config.stress === "Unaged" ? 0 : file.inferred_exposure_duration as number,
        points,
        analysis,
      }];
    }), [curveCandidateGroups, curveMeasurementIds, dataset]);

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
        intervalLow: selection.member.value,
        intervalHigh: selection.member.value,
        intervalLabel: "single value" as const,
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
  const conditionAssessment = (() => {
    if (!dataset) return { status: "incomplete" as const, detail: "Dataset not loaded." };
    let mixed = false;
    let incomplete = false;
    seriesConfigs.forEach((config) => {
      const contributingIds = new Set(trendSeries.find((series) => series.id === config.id)?.points.flatMap((point) => point.members.map((member) => member.sampleUid)) ?? []);
      const samples = dataset.samples.filter((sample) => contributingIds.has(sample.sample_uid));
      const electrodes = new Set(samples.map((sample) => sample.electrode).filter(Boolean));
      const recipes = new Set(samples.map((sample) => sample.recipe_uid).filter(Boolean));
      if (config.electrode === "all" && electrodes.size > 1) mixed = true;
      if (config.recipe === "all" && recipes.size > 1) mixed = true;
      if (samples.some((sample) => !sample.electrode || !sample.recipe_uid)) incomplete = true;
    });
    if (mixed) return { status: "mixed" as const, detail: "At least one series contains multiple electrodes or lamination recipes." };
    if (incomplete) return { status: "incomplete" as const, detail: "At least one contributing sample has no recorded electrode or lamination recipe." };
    return { status: "aligned" as const, detail: "Electrode and lamination recipe are explicit and aligned within every series." };
  })();
  const conditionMixed = conditionAssessment.status !== "aligned";

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
    const orderedValues = points.map((item) => item.point.y).sort((left, right) => left - right);
    const difference = orderedValues[orderedValues.length - 1] - orderedValues[0];
    const limitations = [
      conditionAssessment.status !== "aligned" ? "conditions are not fully controlled" : null,
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
    if (!dataset || !selectedTrendSeries.length) return;
    const rows = [
      ["dataset", "schema_version", "generated_on", "pipeline_version", "series", "material", "ageing_protocol", "electrode", "recipe_uid", "metric_key", "metric", "time", "time_unit", "value_mode", "aggregation", "aggregate_value", "interval_low", "interval_high", "interval_type", "min", "max", "n", "sample_uid", "sample_label", "sample_reference", "batch", "observation_uid", "member_value", "selected_for_display", "source_file", "source_row", "qa_flag", "baseline_policy", "qa_included"],
      ...selectedTrendSeries.flatMap((series) => series.points.flatMap((point) => {
        const selection = resolveTrendSelection(series.id, point);
        return point.members.map((member) => {
          const observation = observationMap.get(member.observationId);
          return [
            dataset.name,
            dataset.schemaVersion,
            dataset.generatedOn ?? "",
            dataset.provenance?.pipelineVersion ?? "unknown",
            series.label,
            series.config.material,
            series.config.stress,
            series.config.electrode,
            series.config.recipe,
            series.config.metric,
            METRICS[series.config.metric].label,
            point.x,
            series.xUnit,
            mode,
            aggregation,
            point.y,
            point.intervalLow,
            point.intervalHigh,
            point.intervalLabel,
            point.min,
            point.max,
            point.n,
            member.sampleUid,
            member.sampleLabel,
            member.sampleReference,
            member.batchNo ?? "",
            member.observationId,
            member.value,
            selection.mode === "member" ? selection.member.observationId === member.observationId : selection.mode === "aggregate",
            observation?.source_file ?? "",
            observation?.source_row ?? "",
            observation?.data_quality_flag ?? "",
            mode === "retention" ? (series.config.stress === "Outdoor" ? "median of first 3–7 QA-valid days; 3/7/14-day sensitivity checked" : "same-sample Unaged reference") : "not applicable",
            includeQa,
          ];
        });
      })),
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
    setCurveMeasurementIds({});
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
    mean: "The mean uses every QA-valid sample. The chart and table report its 95% confidence interval; interpret intervals cautiously when n is small.",
    median: "The median reports the central QA-valid sample and its interquartile range. It is robust to extremes but does not replace inspection of individual values.",
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
          <label className="inline-select"><FieldTitle help={aggregationHelp}>Aggregation</FieldTitle><select value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}><option value="mean">Mean + 95% CI</option><option value="median">Median + IQR</option></select></label>
          <span className="condition-group"><span className={`condition-chip ${conditionMixed ? "warning" : "ok"}`}>{{ aligned: "Aligned conditions", mixed: "Mixed conditions", incomplete: "Incomplete metadata" }[conditionAssessment.status]}</span><InfoTip text={`${conditionAssessment.detail} ${HELP.conditions}`} /></span>
          <span className="check-item outdoor-quality-toggle"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> Include QA-flagged data{relevantOutdoorIssues.length ? ` (${relevantOutdoorIssues.length} outdoor)` : ""}</label><InfoTip text={`${HELP.qa} ${HELP.outdoorQa}`} align="right" /></span>
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
                <div><dt>Aggregation <InfoTip text={aggregationHelp} align="left" /></dt><dd>{{ mean: "mean + 95% CI", median: "median + IQR" }[aggregation]}</dd></div>
              </dl>
              {outdoorIssueExample ? <div className="quality-alert" role="status"><strong>{relevantOutdoorIssues.length} outdoor anomal{relevantOutdoorIssues.length > 1 ? "ies" : "y"} {includeQa ? "included for review" : "excluded from analysis"}</strong><span>{outdoorIssueSample?.material_family ?? outdoorIssueExample.sampleUid}{numeric(outdoorIssueExample.time) ? ` · day ${fr.format(outdoorIssueExample.time)}` : ""}: {outdoorIssueExample.reason}{relevantOutdoorIssues.length > 1 ? ` ${relevantOutdoorIssues.length - 1} additional flagged value${relevantOutdoorIssues.length > 2 ? "s" : ""}.` : ""}</span></div> : null}
              {conditionMixed ? <p className="caution">{conditionAssessment.detail} Treat the comparison as descriptive and do not attribute a difference to the encapsulant alone.</p> : null}
              {selectedTrendSeries.some((series) => series.sampleSetChanges || series.baselineWarnings.length) ? <p className="caution">{selectedTrendSeries.some((series) => series.sampleSetChanges) ? "The contributing sample set changes between some durations. " : ""}{selectedTrendSeries.flatMap((series) => series.baselineWarnings).slice(0, 2).join(" · ")}</p> : null}
            </aside>
            <section className="data-table-card">
              <div className="section-head">
                <div><p className="eyebrow">Aggregated values</p><h4>Displayed points</h4></div>
                <div className="table-head-tools">
                  <span>{aggregation === "mean" ? "95% CI" : "IQR"} · select n to view samples. <InfoTip text={`${HELP.interval} ${HELP.replicates}`} align="right" /></span>
                  {trendSeries.map((series, seriesIndex) => <label className="inline-select patch-select" key={series.id}><FieldTitle help={HELP.globalReplicate} align="right">Sample {String.fromCharCode(65 + seriesIndex)}</FieldTitle><select value={activeTrendSamples[series.id] ?? "aggregate"} onChange={(event) => selectTrendSample(series.id, event.target.value)} style={{ borderLeftColor: series.color }}><option value="aggregate">Aggregate · all</option>{(trendSampleOptions[series.id] ?? []).map((member, index) => <option key={member.sampleUid} value={member.sampleUid}>Sample {index + 1} · {member.sampleLabel} · {member.sampleReference}</option>)}</select></label>)}
                </div>
              </div>
              <div className="table-scroll"><table><thead><tr><th>Series / conditions</th><th>Sample / reference <InfoTip text={HELP.patchReference} align="left" /></th><th>Time</th><th>Plotted value</th><th>Interval low</th><th>Interval high</th><th>n</th></tr></thead><tbody>
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
                      <td>{selection.mode === "aggregate" ? fr.format(point.intervalLow) : "—"}</td>
                      <td>{selection.mode === "aggregate" ? fr.format(point.intervalHigh) : "—"}</td>
                      <td>{point.n > 1 ? <button type="button" className="n-toggle" aria-expanded={expanded} onClick={() => toggleTrendRow(rowKey)} title="Show individual observations">{point.n}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : point.n}</td>
                    </tr>
                    {expanded ? <tr className="replicate-detail-row"><td colSpan={7}>
                      <div className="replicate-panel">
                        <div className="replicate-heading"><strong>Value used on the chart</strong><span>{activeTrendSamples[series.id] ? `Global selection ${series.id.toUpperCase()}: ${globalTarget?.sampleLabel}. A choice here creates a local override.` : "The table uses the reference aggregate."}</span></div>
                        <div className="replicate-choices">
                          <button type="button" className={`replicate-choice ${selection.mode === "aggregate" ? "active" : ""}`} aria-pressed={selection.mode === "aggregate"} onClick={() => selectTrendMember(rowKey)} style={{ borderLeftColor: series.color }}><span><b>Aggregate</b><small>{{ mean: "Mean + 95% CI", median: "Median + IQR" }[aggregation]} · n={point.n}</small></span><strong>{fr.format(point.y)} {series.yUnit}</strong></button>
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
              <label><FieldTitle help={HELP.targetTime}>Target time</FieldTitle><select value={resolvedCurveTime ?? ""} onChange={(event) => { setCurveTime(Number(event.target.value)); setCurveMeasurementIds({}); }} disabled={!selectableCurveTimes.length}>{selectableCurveTimes.length ? selectableCurveTimes.map((time) => <option key={time} value={time}>{fr.format(time)} {curveXUnit}{curveTimes.common.includes(time) ? " · exact for all series" : ""}</option>) : <option>No exact shared time available</option>}</select></label>
              <label><FieldTitle help={HELP.convention}>Current convention</FieldTitle><select value={currentConvention} onChange={(event) => setCurrentConvention(event.target.value as CurrentConvention)}><option value="instrument">Instrument · negative J</option><option value="pv">PV · positive generated J</option></select></label>
              <label><FieldTitle help={HELP.sweep}>Sweep</FieldTitle><select value={sweepView} onChange={(event) => setSweepView(event.target.value as SweepView)}><option value="primary">Primary · recommended</option><option value="all">All segments</option></select></label>
              <label><FieldTitle help={HELP.scale} align="right">Scale</FieldTitle><select value={curveScale} onChange={(event) => setCurveScale(event.target.value as CurveScale)}><option value="primary">Primary segments</option><option value="all">All data</option></select></label>
              <div className="curve-checks">
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showCurvePoints} onChange={(event) => setShowCurvePoints(event.target.checked)} /> Measured points</label><InfoTip text={HELP.rawPoints} align="left" /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showLandmarks} onChange={(event) => setShowLandmarks(event.target.checked)} /> IV landmarks</label><InfoTip text={HELP.landmarks} /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> QA-flagged measurements</label><InfoTip text={HELP.qa} align="right" /></span>
              </div>
            </div>
            <div className="curve-selection-grid" aria-label="IV measurement selection">
              {curveCandidateGroups.map((group, index) => <label key={group.seriesId} style={{ borderTopColor: group.color }}>
                <FieldTitle help={HELP.curveChoice} align={index === curveCandidateGroups.length - 1 ? "right" : "left"}>Series {String.fromCharCode(65 + index)} measurement</FieldTitle>
                <select value={curveMeasurementIds[group.seriesId] ?? "representative"} disabled={!group.candidates.length} onChange={(event) => setCurveMeasurementIds((current) => ({ ...current, [group.seriesId]: event.target.value === "representative" ? null : event.target.value }))}>
                  <option value="representative">Representative · closest to median efficiency</option>
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
                <p className="measurement-selection-mode">{curveMeasurementIds[selection.seriesId] ? "Explicit measurement" : "Representative measurement nearest the median efficiency"}</p>
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

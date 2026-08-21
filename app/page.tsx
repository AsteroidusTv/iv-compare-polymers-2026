"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "./lib/iv-data";
import { analyzeIVCurve } from "./lib/iv-curve-analysis";

const COLORS = { a: "#ee735e", b: "#3469d4" };
const fr = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });

type View = "trend" | "curves";
type ValueMode = "absolute" | "retention";
type CurrentConvention = "instrument" | "pv";
type SweepView = "primary" | "all";
type CurveScale = "primary" | "all";
type SeriesId = "a" | "b";

const METRIC_HELP: Record<MetricKey, string> = {
  efficiency_pct: "Le rendement est la puissance électrique maximale délivrée divisée par la puissance lumineuse incidente. Il combine les effets de Jsc, Voc et du fill factor.",
  jsc_mA_cm2: "Jsc est la densité de courant de court-circuit, évaluée à V = 0. Elle reflète principalement la génération et la collecte des charges photogénérées.",
  voc_V: "Voc est la tension de circuit ouvert, obtenue lorsque le courant est nul. Elle est sensible aux pertes par recombinaison et à la qualité des interfaces.",
  ff_pct: "Le fill factor mesure la rectangularité de la courbe IV : FF = Pmax / (Voc × Jsc). Une baisse signale souvent davantage de pertes résistives ou de recombinaison.",
};

const HELP = {
  polymer: "Famille du polymère d’encapsulation associée au patch dans l’inventaire. Pour isoler son effet, gardez l’électrode et la recette de lamination identiques.",
  ageing: "Type de vieillissement appliqué : DH correspond à chaleur humide, TC aux cycles thermiques et Outdoor à l’exposition extérieure. Les durées ne sont comparables qu’au sein d’un même protocole.",
  electrode: "Métal de l’électrode du dispositif. Il peut modifier les contacts, la corrosion et la stabilité ; mélanger plusieurs électrodes introduit un facteur de confusion.",
  recipe: "Conditions de lamination liées au patch : température, pression, durée et séquences. Une recette différente peut modifier l’adhésion, la réticulation et les performances IV.",
  retention: "Rétention = valeur au temps t / valeur initiale du même patch × 100. Elle compare la dégradation relative, mais nécessite une mesure initiale correctement appariée.",
  conditions: "Conditions alignées signifie qu’une électrode et une recette précises sont sélectionnées. En conditions mixtes, l’écart observé ne peut pas être attribué au seul polymère.",
  matching: "L’appariement relie chaque fichier IV au patch de l’inventaire grâce aux métadonnées. Les fichiers exclus restent dans le jeu source mais ne participent pas aux comparaisons par défaut.",
  observations: "Nombre total de mesures individuelles contribuant aux points actuellement affichés. Ce n’est pas le nombre de durées ni le nombre de moyennes.",
  minmax: "Pour chaque durée, la ligne principale montre la valeur agrégée. Les traits fins couvrent la valeur minimale et maximale des observations retenues.",
  targetTime: "Le site cherche cette durée pour les deux matériaux. Si elle n’existe pas exactement, il retient le temps disponible le plus proche et l’indique dans la légende.",
  convention: "La convention instrument affiche le photocourant négatif, comme les valeurs brutes du simulateur solaire. La convention PV inverse seulement le signe pour montrer le courant produit positif ; la physique ne change pas.",
  sweep: "La suite de points est découpée lorsqu’un saut de tension ou une inversion de balayage est détecté. Le segment principal couvre normalement V = 0 et le passage par Voc ; les autres segments restent conservés.",
  scale: "L’échelle « segments principaux » reste lisible pour comparer les matériaux. « Toutes les données » élargit les axes jusqu’aux segments secondaires, sans modifier aucune valeur.",
  rawPoints: "Affiche chaque point réellement mesuré. Aucune interpolation ni aucun lissage n’est utilisé pour tracer la ligne entre deux points successifs d’un même segment.",
  landmarks: "Jsc est interpolé à V = 0, Voc à J = 0 et MPP correspond au point mesuré qui maximise la puissance délivrée. Ces repères servent à lire la courbe, pas à remplacer les valeurs du logiciel source.",
  qa: "Inclut aussi les mesures portant un signalement automatique : valeur extrême, métadonnée ambiguë ou autre incohérence. Elles sont masquées par défaut pour éviter des conclusions fragiles.",
  pointAudit: "Le numérateur indique les points tracés dans le mode choisi ; le dénominateur indique tous les points présents dans les fichiers. Les points non affichés ne sont jamais supprimés.",
  segmentation: "Le segment principal est choisi automatiquement selon la continuité du balayage, la présence de V = 0 et la cohérence avec Voc. Tous les segments gardent leur ordre d’acquisition d’origine.",
  efficiency: "Puissance maximale extraite sous éclairement, rapportée à la puissance incidente et exprimée en pourcentage.",
  voc: "Tension de circuit ouvert, au point où la densité de courant traverse zéro.",
  jsc: "Densité de courant à V = 0. La fiche conserve la valeur positive rapportée par le logiciel, même lorsque la courbe utilise la convention instrument négative.",
  ff: "FF = Pmax / (Voc × Jsc). Plus la courbe possède un coude net et peu de pertes résistives, plus cette valeur est élevée.",
} as const;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "fr"));
}

function timeUnit(stress: string): string {
  if (stress === "TC" || stress === "DH+TC") return "cycles";
  if (stress === "Outdoor") return "jours";
  return "h";
}

function numeric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default function Home() {
  const [dataset, setDataset] = useState<IVDataset | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadMessage, setLoadMessage] = useState("Chargement du jeu DOWSIL…");
  const [view, setView] = useState<View>("trend");
  const [materialA, setMaterialA] = useState("");
  const [materialB, setMaterialB] = useState("");
  const [stress, setStress] = useState("DH");
  const [metric, setMetric] = useState<MetricKey>("efficiency_pct");
  const [mode, setMode] = useState<ValueMode>("retention");
  const [aggregation, setAggregation] = useState<Aggregation>("mean");
  const [electrode, setElectrode] = useState("all");
  const [recipe, setRecipe] = useState("all");
  const [includeQa, setIncludeQa] = useState(false);
  const [curveTime, setCurveTime] = useState<number | null>(null);
  const [currentConvention, setCurrentConvention] = useState<CurrentConvention>("instrument");
  const [sweepView, setSweepView] = useState<SweepView>("primary");
  const [curveScale, setCurveScale] = useState<CurveScale>("primary");
  const [showCurvePoints, setShowCurvePoints] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesId>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const installDataset = useCallback((next: IVDataset, message: string) => {
    setDataset(next);
    setLoadState("ready");
    setLoadMessage(message);
    const materials = unique(next.samples.map((sample) => sample.material_family));
    const preferredA = materials.includes("POE-1 / Mitsui") ? "POE-1 / Mitsui" : materials[0] ?? "";
    const preferredB = materials.includes("POE-2 / TF4") ? "POE-2 / TF4" : materials.find((item) => item !== preferredA) ?? preferredA;
    setMaterialA(preferredA);
    setMaterialB(preferredB);
    setElectrode("all");
    setRecipe("all");
    setHiddenSeries(new Set());
  }, []);

  useEffect(() => {
    let active = true;
    fetchDefaultDataset()
      .then((next) => active && installDataset(next, "Jeu DOWSIL chargé"))
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
    setLoadMessage(files.length === 1 ? "Lecture du paquet…" : "Conversion du classeur et des points IV…");
    try {
      const next = await importDatasetFiles(files);
      installDataset(next, `${next.name} chargé`);
    } catch (error) {
      setLoadState("error");
      setLoadMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [installDataset]);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void processFiles(Array.from(event.dataTransfer.files));
  };

  const materials = useMemo(() => unique(dataset?.samples.map((sample) => sample.material_family) ?? []), [dataset]);
  const sampleMap = useMemo(() => new Map(dataset?.samples.map((sample) => [sample.sample_uid, sample]) ?? []), [dataset]);
  const recipeMap = useMemo(() => new Map(dataset?.recipes.map((item) => [item.recipe_uid, item]) ?? []), [dataset]);
  const relevantSamples = useMemo(() => dataset?.samples.filter((sample) => sample.material_family === materialA || sample.material_family === materialB) ?? [], [dataset, materialA, materialB]);
  const electrodes = useMemo(() => unique(relevantSamples.map((sample) => sample.electrode)), [relevantSamples]);
  const recipes = useMemo(() => {
    const ids = unique(relevantSamples.map((sample) => sample.recipe_uid));
    return ids.map((id) => ({ id, label: recipeMap.get(id)?.recipe_raw || id }));
  }, [relevantSamples, recipeMap]);
  const stresses = useMemo(() => {
    const available = unique(dataset?.observations.map((observation) => observation.test_type) ?? []);
    const ordered = ["DH", "TC", "Outdoor", "Unaged", "DH+TC"].filter((item) => available.includes(item));
    return ordered.length ? ordered : available;
  }, [dataset]);

  useEffect(() => {
    if (stresses.length && !stresses.includes(stress)) setStress(stresses[0]);
  }, [stress, stresses]);

  const samplePasses = useCallback((sampleId: string | null | undefined, material: string) => {
    if (!sampleId) return false;
    const sample = sampleMap.get(sampleId);
    if (!sample || sample.material_family !== material) return false;
    if (electrode !== "all" && sample.electrode !== electrode) return false;
    if (recipe !== "all" && sample.recipe_uid !== recipe) return false;
    return true;
  }, [sampleMap, electrode, recipe]);

  const baselineBySample = useMemo(() => {
    const result = new Map<string, number>();
    dataset?.observations.forEach((observation) => {
      const value = observation[metric];
      if (observation.test_type === "Unaged" && numeric(value) && !result.has(observation.sample_uid)) result.set(observation.sample_uid, value);
    });
    return result;
  }, [dataset, metric]);

  const trendSeries = useMemo<TrendSeries[]>(() => {
    if (!dataset) return [];
    const build = (id: SeriesId, material: string, color: string): TrendSeries => {
      const groups = new Map<number, number[]>();
      dataset.observations.forEach((observation) => {
        if (observation.test_type !== stress || !samplePasses(observation.sample_uid, material)) return;
        const raw = observation[metric];
        if (!numeric(raw)) return;
        const x = stress === "Unaged" ? 0 : observation.exposure_duration_numeric;
        if (!numeric(x)) return;
        let value = raw;
        if (mode === "retention") {
          const baseline = baselineBySample.get(observation.sample_uid);
          if (!numeric(baseline) || baseline === 0) return;
          value = stress === "Unaged" ? 100 : (raw / baseline) * 100;
        }
        const values = groups.get(x) ?? [];
        values.push(value);
        groups.set(x, values);
      });
      const points: TrendPoint[] = [...groups.entries()].map(([x, values]) => ({
        x,
        y: aggregate(values, aggregation),
        min: Math.min(...values),
        max: Math.max(...values),
        n: values.length,
      })).sort((a, b) => a.x - b.x);
      return { id, label: material, color, points };
    };
    return [build("a", materialA, COLORS.a), build("b", materialB, COLORS.b)];
  }, [dataset, materialA, materialB, stress, metric, mode, aggregation, samplePasses, baselineBySample]);

  const eligibleFiles = useCallback((material: string) => {
    if (!dataset) return [];
    return dataset.files.filter((file) => {
      if (!file.match_status.startsWith("matched_") || !samplePasses(file.sample_uid, material)) return false;
      return file.inferred_test_type === stress;
    });
  }, [dataset, samplePasses, stress]);

  const curveTimes = useMemo(() => {
    const getTimes = (material: string) => eligibleFiles(material)
      .map((file) => stress === "Unaged" ? 0 : file.inferred_exposure_duration)
      .filter(numeric);
    const a = new Set(getTimes(materialA));
    const b = new Set(getTimes(materialB));
    const common = [...a].filter((value) => b.has(value)).sort((x, y) => x - y);
    const all = [...new Set([...a, ...b])].sort((x, y) => x - y);
    return { all, common };
  }, [eligibleFiles, materialA, materialB, stress]);

  useEffect(() => {
    if (!curveTimes.all.length) {
      setCurveTime(null);
      return;
    }
    if (curveTime === null || !curveTimes.all.includes(curveTime)) {
      const preferred = curveTimes.common.length ? curveTimes.common[curveTimes.common.length - 1] : curveTimes.all[curveTimes.all.length - 1];
      setCurveTime(preferred);
    }
  }, [curveTime, curveTimes]);

  const curveSelections = useMemo(() => {
    if (!dataset || curveTime === null) return [];
    const pick = (seriesId: SeriesId, material: string, color: string) => {
      const files = eligibleFiles(material).filter((file) => numeric(stress === "Unaged" ? 0 : file.inferred_exposure_duration));
      if (!files.length) return null;
      const distance = Math.min(...files.map((file) => Math.abs((stress === "Unaged" ? 0 : file.inferred_exposure_duration as number) - curveTime)));
      const nearest = files.filter((file) => Math.abs((stress === "Unaged" ? 0 : file.inferred_exposure_duration as number) - curveTime) === distance);
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
        seriesId,
        material,
        color,
        measurement,
        file,
        actualTime: stress === "Unaged" ? 0 : file.inferred_exposure_duration as number,
        points,
        analysis,
      };
    };
    return [pick("a", materialA, COLORS.a), pick("b", materialB, COLORS.b)].filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [dataset, curveTime, eligibleFiles, includeQa, materialA, materialB, stress]);

  const currentPolarity = currentConvention === "instrument" ? -1 : 1;
  const curveSeries: CurveSeries[] = curveSelections.map((selection) => ({
    id: selection.seriesId,
    label: selection.material,
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
  const visibleTrendSeries = trendSeries.filter((series) => !hiddenSeries.has(series.id));
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
  const xUnit = timeUnit(stress);
  const yUnit = mode === "retention" ? "% de l’état initial" : METRICS[metric].unit;
  const conditionMixed = electrode === "all" || recipe === "all";

  const trendInsight = useMemo(() => {
    const [a, b] = trendSeries;
    if (!a || !b) return null;
    const aByX = new Map(a.points.map((point) => [point.x, point]));
    const common = b.points.filter((point) => aByX.has(point.x));
    if (!common.length) return null;
    const pointB = common[common.length - 1];
    const pointA = aByX.get(pointB.x)!;
    const difference = pointB.y - pointA.y;
    const leader = difference >= 0 ? materialB : materialA;
    return {
      title: `${leader} en tête à ${fr.format(pointB.x)} ${xUnit}`,
      detail: `Écart de ${fr.format(Math.abs(difference))} ${mode === "retention" ? "points de rétention" : METRICS[metric].unit}.`,
      time: pointB.x,
      count: pointA.n + pointB.n,
    };
  }, [trendSeries, materialA, materialB, xUnit, mode, metric]);

  const exportTrend = () => {
    const [a, b] = trendSeries;
    if (!a || !b) return;
    const times = [...new Set([...a.points.map((point) => point.x), ...b.points.map((point) => point.x)])].sort((x, y) => x - y);
    const lookup = (series: TrendSeries, x: number) => series.points.find((point) => point.x === x);
    const rows = [
      ["temps", "unite_temps", `${materialA}_valeur`, `${materialA}_n`, `${materialB}_valeur`, `${materialB}_n`],
      ...times.map((time) => {
        const left = lookup(a, time);
        const right = lookup(b, time);
        return [time, xUnit, left?.y ?? "", left?.n ?? "", right?.y ?? "", right?.n ?? ""];
      }),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `comparaison-${materialA}-${materialB}-${stress}.csv`.replaceAll(/[^a-zA-Z0-9.-]+/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  };

  const report = dataset?.report;
  const comparisonCount = trendSeries.reduce((total, series) => total + series.points.reduce((sum, point) => sum + point.n, 0), 0);
  const aggregationHelp = {
    mean: "La moyenne utilise toutes les valeurs et reste sensible aux mesures extrêmes.",
    median: "La médiane retient la valeur centrale et résiste mieux aux valeurs extrêmes, mais masque une éventuelle dispersion bimodale.",
    best: "La meilleure valeur retient le maximum observé à chaque durée. Elle montre le potentiel atteint, pas le comportement représentatif du groupe.",
  }[aggregation];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">IV</div>
        <div>
          <p className="eyebrow">Outil interne · données IV</p>
          <h1>IV Compare</h1>
        </div>
        <div className={`dataset-pill ${loadState}`}><span /> {loadMessage}</div>
      </header>

      <section className="dataset-toolbar">
        <div className="dataset-stats" aria-label="Résumé du jeu de données">
          <div><strong>{report ? fr.format(report.samples) : "—"}</strong><span>patchs</span></div>
          <div><strong>{report ? fr.format(report.measurements) : "—"}</strong><span>courbes IV</span></div>
          <div><strong>{report ? `${fr.format(report.points / 1000)}k` : "—"}</strong><span>points</span></div>
        </div>
        <label className={`compact-import ${loadState === "loading" ? "busy" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <input ref={fileInputRef} type="file" multiple accept=".ivpack,.json,.gz,.xlsx,.tsv" aria-label="Importer les données IV" onChange={(event) => void processFiles(Array.from(event.target.files ?? []))} />
          <span className="import-action">Importer des données</span>
          <small>.ivpack ou .xlsx + .tsv · traitement local</small>
        </label>
      </section>

      <section className="workspace-card" aria-busy={loadState === "loading"}>
        <div className="workspace-head">
          <div>
            <p className="eyebrow">Espace de comparaison</p>
            <h3>{stress === "Unaged" ? "État initial" : `Évolution après ${stress}`}</h3>
          </div>
          <div className="head-actions">
            <a className="soft-button" href="/data/iv-compare-dowsil.ivpack" download>Paquet exemple</a>
            <button type="button" className="primary-button" onClick={exportTrend} disabled={!comparisonCount}>Exporter CSV</button>
          </div>
        </div>

        <div className="filters">
          <label><FieldTitle help={HELP.polymer}>Polymère A</FieldTitle><select value={materialA} onChange={(event) => setMaterialA(event.target.value)}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><FieldTitle help={HELP.polymer}>Polymère B</FieldTitle><select value={materialB} onChange={(event) => setMaterialB(event.target.value)}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><FieldTitle help={HELP.ageing}>Vieillissement</FieldTitle><select value={stress} onChange={(event) => setStress(event.target.value)}>{stresses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><FieldTitle help={METRIC_HELP[metric]}>Mesure</FieldTitle><select value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>{Object.entries(METRICS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
          <label><FieldTitle help={HELP.electrode} align="right">Électrode</FieldTitle><select value={electrode} onChange={(event) => setElectrode(event.target.value)}><option value="all">Toutes</option>{electrodes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><FieldTitle help={HELP.recipe} align="right">Recette</FieldTitle><select value={recipe} onChange={(event) => setRecipe(event.target.value)}><option value="all">Toutes les recettes</option>{recipes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>

        <div className="control-row">
          <div className="segmented" aria-label="Mode de valeur">
            <button className={mode === "retention" ? "active" : ""} onClick={() => setMode("retention")}>Rétention</button>
            <button className={mode === "absolute" ? "active" : ""} onClick={() => setMode("absolute")}>Valeur absolue</button>
          </div>
          <InfoTip text={HELP.retention} align="left" />
          <label className="inline-select"><FieldTitle help={aggregationHelp}>Agrégation</FieldTitle><select value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}><option value="mean">Moyenne</option><option value="median">Médiane</option><option value="best">Meilleure valeur</option></select></label>
          <span className="condition-group"><span className={`condition-chip ${conditionMixed ? "warning" : "ok"}`}>{conditionMixed ? "Conditions mixtes" : "Conditions alignées"}</span><InfoTip text={HELP.conditions} /></span>
          <span className="quality-note">{report ? `${report.matchedFiles}/${report.files} fichiers appariés · ${report.reviewFiles} exclus` : ""}<InfoTip text={HELP.matching} align="right" /></span>
        </div>

        <nav className="view-tabs" aria-label="Type de graphique">
          <button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}><span>01</span> Performance dans le temps</button>
          <button className={view === "curves" ? "active" : ""} onClick={() => setView("curves")}><span>02</span> Courbes IV</button>
        </nav>

        {view === "trend" ? (
          <div className="chart-layout">
            <section className="chart-card">
              <div className="chart-title">
                {trendSeries.map((series) => {
                  const hidden = hiddenSeries.has(series.id);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={series.id} aria-pressed={!hidden} onClick={() => toggleSeries(series.id)} title={`${hidden ? "Afficher" : "Masquer"} ${series.label} — les calculs restent inchangés`}><span className="legend-dot" style={{ background: series.color }} />{series.label}</button>;
                })}
                <span>{METRICS[metric].label} · {yUnit}<InfoTip text={METRIC_HELP[metric]} align="right" /></span>
              </div>
              <TrendChart series={visibleTrendSeries} xUnit={xUnit} yUnit={yUnit} />
            </section>
            <aside className="insight-card">
              <p className="eyebrow">Lecture rapide</p>
              <strong>{trendInsight?.title ?? "Pas encore de point commun"}</strong>
              <p>{trendInsight?.detail ?? "Les deux séries n’ont pas de durée comparable avec ces filtres."}</p>
              <dl>
                <div><dt>Observations <InfoTip text={HELP.observations} align="left" /></dt><dd>{comparisonCount}</dd></div>
                <div><dt>Mode <InfoTip text={HELP.retention} align="left" /></dt><dd>{mode === "retention" ? "vs initial" : "absolu"}</dd></div>
                <div><dt>Agrégation <InfoTip text={aggregationHelp} align="left" /></dt><dd>{{ mean: "moyenne", median: "médiane", best: "meilleure" }[aggregation]}</dd></div>
              </dl>
              {conditionMixed ? <p className="caution">Pour conclure sur le matériau, choisissez une électrode et une recette identiques.</p> : null}
            </aside>
            <section className="data-table-card">
              <div className="section-head"><div><p className="eyebrow">Valeurs agrégées</p><h4>Points affichés</h4></div><span>Les traits fins montrent min–max. <InfoTip text={HELP.minmax} align="right" /></span></div>
              <div className="table-scroll"><table><thead><tr><th>Matériau</th><th>Temps</th><th>Valeur</th><th>Min</th><th>Max</th><th>n</th></tr></thead><tbody>{trendSeries.flatMap((series) => series.points.map((point) => <tr key={`${series.label}-${point.x}`}><td><span className="table-dot" style={{ background: series.color }} />{series.label}</td><td>{fr.format(point.x)} {xUnit}</td><td><b>{fr.format(point.y)}</b> {yUnit}</td><td>{fr.format(point.min)}</td><td>{fr.format(point.max)}</td><td>{point.n}</td></tr>))}</tbody></table></div>
            </section>
          </div>
        ) : (
          <div className="curve-workspace">
            <div className="curve-toolbar">
              <label><FieldTitle help={HELP.targetTime}>Temps cible</FieldTitle><select value={curveTime ?? ""} onChange={(event) => setCurveTime(Number(event.target.value))} disabled={!curveTimes.all.length}>{curveTimes.all.length ? curveTimes.all.map((time) => <option key={time} value={time}>{fr.format(time)} {xUnit}{curveTimes.common.includes(time) ? " · commun" : ""}</option>) : <option>Aucun temps disponible</option>}</select></label>
              <label><FieldTitle help={HELP.convention}>Convention du courant</FieldTitle><select value={currentConvention} onChange={(event) => setCurrentConvention(event.target.value as CurrentConvention)}><option value="instrument">Logiciel · J négatif</option><option value="pv">PV · J produit positif</option></select></label>
              <label><FieldTitle help={HELP.sweep}>Balayage</FieldTitle><select value={sweepView} onChange={(event) => setSweepView(event.target.value as SweepView)}><option value="primary">Principal · recommandé</option><option value="all">Tous les segments</option></select></label>
              <label><FieldTitle help={HELP.scale} align="right">Échelle</FieldTitle><select value={curveScale} onChange={(event) => setCurveScale(event.target.value as CurveScale)}><option value="primary">Segments principaux</option><option value="all">Toutes les données</option></select></label>
              <div className="curve-checks">
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showCurvePoints} onChange={(event) => setShowCurvePoints(event.target.checked)} /> Points mesurés</label><InfoTip text={HELP.rawPoints} align="left" /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={showLandmarks} onChange={(event) => setShowLandmarks(event.target.checked)} /> Repères IV</label><InfoTip text={HELP.landmarks} /></span>
                <span className="check-item"><label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> Mesures signalées QA</label><InfoTip text={HELP.qa} align="right" /></span>
              </div>
            </div>
            <section className="chart-card curve-chart-card">
              <div className="chart-title">
                {curveSelections.map((selection) => {
                  const hidden = hiddenSeries.has(selection.seriesId);
                  return <button type="button" className={`legend-toggle ${hidden ? "hidden" : ""}`} key={selection.seriesId} aria-pressed={!hidden} onClick={() => toggleSeries(selection.seriesId)} title={`${hidden ? "Afficher" : "Masquer"} ${selection.material} — les calculs restent inchangés`}><span className="legend-dot" style={{ background: selection.color }} />{selection.material} · {fr.format(selection.actualTime)} {xUnit}</button>;
                })}
                <span>{currentConvention === "instrument" ? "Convention logiciel · photocourant négatif" : "Convention PV · courant produit positif"}</span>
              </div>
              {curveAudit.raw ? <div className={`curve-audit ${curveAudit.raw === curveAudit.primary ? "clean" : "segmented"}`} role="status"><span className="curve-audit-title"><strong>{displayedPointCount}/{curveAudit.raw} points affichés</strong><InfoTip text={HELP.pointAudit} align="left" /></span><span>{curveAudit.raw === curveAudit.primary ? "Balayage continu" : `${curveAudit.raw - curveAudit.primary} points supplémentaires conservés · ${curveAudit.segments} segments détectés`}</span></div> : null}
              <CurveChart series={visibleCurveSeries} yAxisLabel={currentConvention === "instrument" ? "J instrument (mA/cm²)" : "J produit (mA/cm²)"} currentConvention={currentConvention} showPoints={showCurvePoints} showLandmarks={showLandmarks} scaleMode={curveScale} />
            </section>
            <div className="measurement-grid">
              {curveSelections.map((selection) => <article className="measurement-card" key={selection.material} style={{ borderTopColor: selection.color }}>
                <p className="eyebrow">{selection.material}</p>
                <h4>{fr.format(selection.actualTime)} {xUnit} · {selection.measurement.measurement_uid}</h4>
                <dl>
                  <div><dt>Rendement <InfoTip text={HELP.efficiency} align="left" /></dt><dd>{numeric(selection.measurement.efficiency_pct) ? `${fr.format(selection.measurement.efficiency_pct)} %` : "—"}</dd></div>
                  <div><dt>Voc <InfoTip text={HELP.voc} /></dt><dd>{numeric(selection.measurement.voc_V) ? `${fr.format(selection.measurement.voc_V)} V` : "—"}</dd></div>
                  <div><dt>Jsc <InfoTip text={HELP.jsc} /></dt><dd>{numeric(selection.measurement.jsc_mA_cm2) ? `${fr.format(selection.measurement.jsc_mA_cm2)} mA/cm²` : "—"}</dd></div>
                  <div><dt>FF <InfoTip text={HELP.ff} align="right" /></dt><dd>{numeric(selection.measurement.ff_pct) ? `${fr.format(selection.measurement.ff_pct)} %` : "—"}</dd></div>
                </dl>
                <p className="curve-segment-note">Segment principal : {selection.analysis.primaryPointCount}/{selection.analysis.rawPointCount} points · {selection.analysis.segments.length} segment{selection.analysis.segments.length > 1 ? "s" : ""} conservé{selection.analysis.segments.length > 1 ? "s" : ""}<InfoTip text={HELP.segmentation} align="right" /></p>
                <small>{selection.file.source_file}</small>
              </article>)}
              {!curveSelections.length ? <div className="missing-selection">Aucune mesure répondant à ces filtres.</div> : null}
            </div>
          </div>
        )}
      </section>

      <footer>
        <span>IV Compare · format .ivpack v1.0</span>
        <span>Les valeurs extrêmes restent disponibles via le contrôle QA.</span>
      </footer>
    </main>
  );
}

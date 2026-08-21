"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CurveChart, CurveSeries, TrendChart, TrendPoint, TrendSeries } from "./components/Charts";
import {
  Aggregation,
  aggregate,
  fetchDefaultDataset,
  importDatasetFiles,
  IVDataset,
  METRICS,
  MetricKey,
} from "./lib/iv-data";

const COLORS = { a: "#ee735e", b: "#3469d4" };
const fr = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });

type View = "trend" | "curves";
type ValueMode = "absolute" | "retention";
type CurrentConvention = "instrument" | "pv";

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
    const build = (material: string, color: string): TrendSeries => {
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
      return { label: material, color, points };
    };
    return [build(materialA, COLORS.a), build(materialB, COLORS.b)];
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
    const pick = (material: string, color: string) => {
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
      return {
        material,
        color,
        measurement,
        file,
        actualTime: stress === "Unaged" ? 0 : file.inferred_exposure_duration as number,
        points,
      };
    };
    return [pick(materialA, COLORS.a), pick(materialB, COLORS.b)].filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [dataset, curveTime, eligibleFiles, includeQa, materialA, materialB, stress]);

  const currentPolarity = currentConvention === "instrument" ? -1 : 1;
  const curveSeries: CurveSeries[] = curveSelections.map((selection) => ({
    label: selection.material,
    color: selection.color,
    points: selection.points.map((point) => ({ x: point.x, y: point.y * currentPolarity })),
  }));
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">IV</div>
        <div>
          <p className="eyebrow">Perovskite encapsulation lab</p>
          <h1>IV Compare</h1>
        </div>
        <div className={`dataset-pill ${loadState}`}><span /> {loadMessage}</div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="kicker">Comparer sans perdre le contexte expérimental</p>
          <h2>Quel polymère tient le mieux après vieillissement&nbsp;?</h2>
          <p className="lede">Alignez matériau, électrode et recette de lamination. Suivez la performance dans le temps, puis ouvrez les courbes IV qui expliquent l’écart.</p>
          <div className="hero-stats">
            <div><strong>{report ? fr.format(report.samples) : "—"}</strong><span>patchs</span></div>
            <div><strong>{report ? fr.format(report.measurements) : "—"}</strong><span>courbes IV</span></div>
            <div><strong>{report ? `${fr.format(report.points / 1000)}k` : "—"}</strong><span>points</span></div>
          </div>
        </div>
        <label className={`import-card ${loadState === "loading" ? "busy" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <span className="import-icon">＋</span>
          <strong>Importer vos données triées</strong>
          <small>Un paquet <b>.ivpack</b>, ou ensemble le classeur normalisé <b>.xlsx</b> et les points <b>.tsv</b>.</small>
          <input ref={fileInputRef} type="file" multiple accept=".ivpack,.json,.gz,.xlsx,.tsv" aria-label="Importer les données IV" onChange={(event) => void processFiles(Array.from(event.target.files ?? []))} />
          <span className="import-action">Choisir les fichiers</span>
          <span className="privacy-note">Traitement dans votre navigateur · aucun envoi</span>
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
          <label>Polymère A<select value={materialA} onChange={(event) => setMaterialA(event.target.value)}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Polymère B<select value={materialB} onChange={(event) => setMaterialB(event.target.value)}>{materials.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Vieillissement<select value={stress} onChange={(event) => setStress(event.target.value)}>{stresses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Mesure<select value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>{Object.entries(METRICS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
          <label>Électrode<select value={electrode} onChange={(event) => setElectrode(event.target.value)}><option value="all">Toutes</option>{electrodes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Recette<select value={recipe} onChange={(event) => setRecipe(event.target.value)}><option value="all">Toutes les recettes</option>{recipes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>

        <div className="control-row">
          <div className="segmented" aria-label="Mode de valeur">
            <button className={mode === "retention" ? "active" : ""} onClick={() => setMode("retention")}>Rétention</button>
            <button className={mode === "absolute" ? "active" : ""} onClick={() => setMode("absolute")}>Valeur absolue</button>
          </div>
          <label className="inline-select">Agrégation<select value={aggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}><option value="mean">Moyenne</option><option value="median">Médiane</option><option value="best">Meilleure valeur</option></select></label>
          <span className={`condition-chip ${conditionMixed ? "warning" : "ok"}`}>{conditionMixed ? "Conditions mixtes" : "Conditions alignées"}</span>
          <span className="quality-note">{report ? `${report.matchedFiles}/${report.files} fichiers appariés · ${report.reviewFiles} exclus` : ""}</span>
        </div>

        <nav className="view-tabs" aria-label="Type de graphique">
          <button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}><span>01</span> Performance dans le temps</button>
          <button className={view === "curves" ? "active" : ""} onClick={() => setView("curves")}><span>02</span> Courbes IV</button>
        </nav>

        {view === "trend" ? (
          <div className="chart-layout">
            <section className="chart-card">
              <div className="chart-title">
                <div><span className="legend-dot coral" />{materialA}</div>
                <div><span className="legend-dot blue" />{materialB}</div>
                <span>{METRICS[metric].label} · {yUnit}</span>
              </div>
              <TrendChart series={trendSeries} xUnit={xUnit} yUnit={yUnit} />
            </section>
            <aside className="insight-card">
              <p className="eyebrow">Lecture rapide</p>
              <strong>{trendInsight?.title ?? "Pas encore de point commun"}</strong>
              <p>{trendInsight?.detail ?? "Les deux séries n’ont pas de durée comparable avec ces filtres."}</p>
              <dl>
                <div><dt>Observations</dt><dd>{comparisonCount}</dd></div>
                <div><dt>Mode</dt><dd>{mode === "retention" ? "vs initial" : "absolu"}</dd></div>
                <div><dt>Agrégation</dt><dd>{{ mean: "moyenne", median: "médiane", best: "meilleure" }[aggregation]}</dd></div>
              </dl>
              {conditionMixed ? <p className="caution">Pour conclure sur le matériau, choisissez une électrode et une recette identiques.</p> : null}
            </aside>
            <section className="data-table-card">
              <div className="section-head"><div><p className="eyebrow">Valeurs agrégées</p><h4>Points affichés</h4></div><span>Les traits fins montrent min–max.</span></div>
              <div className="table-scroll"><table><thead><tr><th>Matériau</th><th>Temps</th><th>Valeur</th><th>Min</th><th>Max</th><th>n</th></tr></thead><tbody>{trendSeries.flatMap((series) => series.points.map((point) => <tr key={`${series.label}-${point.x}`}><td><span className="table-dot" style={{ background: series.color }} />{series.label}</td><td>{fr.format(point.x)} {xUnit}</td><td><b>{fr.format(point.y)}</b> {yUnit}</td><td>{fr.format(point.min)}</td><td>{fr.format(point.max)}</td><td>{point.n}</td></tr>))}</tbody></table></div>
            </section>
          </div>
        ) : (
          <div className="curve-workspace">
            <div className="curve-toolbar">
              <label>Temps cible<select value={curveTime ?? ""} onChange={(event) => setCurveTime(Number(event.target.value))} disabled={!curveTimes.all.length}>{curveTimes.all.length ? curveTimes.all.map((time) => <option key={time} value={time}>{fr.format(time)} {xUnit}{curveTimes.common.includes(time) ? " · commun" : ""}</option>) : <option>Aucun temps disponible</option>}</select></label>
              <label>Convention du courant<select value={currentConvention} onChange={(event) => setCurrentConvention(event.target.value as CurrentConvention)}><option value="instrument">Logiciel · J négatif</option><option value="pv">PV · J produit positif</option></select></label>
              <label className="check-control"><input type="checkbox" checked={includeQa} onChange={(event) => setIncludeQa(event.target.checked)} /> Inclure les mesures signalées QA</label>
              <span>La meilleure courbe disponible est retenue pour chaque matériau, au temps commun ou le plus proche.</span>
            </div>
            <section className="chart-card curve-chart-card">
              <div className="chart-title">
                {curveSelections.map((selection) => <div key={selection.material}><span className="legend-dot" style={{ background: selection.color }} />{selection.material} · {fr.format(selection.actualTime)} {xUnit}</div>)}
                <span>{currentConvention === "instrument" ? "Convention logiciel · photocourant négatif" : "Convention PV · courant produit positif"}</span>
              </div>
              <CurveChart series={curveSeries} yAxisLabel={currentConvention === "instrument" ? "J instrument (mA/cm²)" : "J produit (mA/cm²)"} />
            </section>
            <div className="measurement-grid">
              {curveSelections.map((selection) => <article className="measurement-card" key={selection.material} style={{ borderTopColor: selection.color }}><p className="eyebrow">{selection.material}</p><h4>{fr.format(selection.actualTime)} {xUnit} · {selection.measurement.measurement_uid}</h4><dl><div><dt>Rendement</dt><dd>{numeric(selection.measurement.efficiency_pct) ? `${fr.format(selection.measurement.efficiency_pct)} %` : "—"}</dd></div><div><dt>Voc</dt><dd>{numeric(selection.measurement.voc_V) ? `${fr.format(selection.measurement.voc_V)} V` : "—"}</dd></div><div><dt>Jsc</dt><dd>{numeric(selection.measurement.jsc_mA_cm2) ? `${fr.format(selection.measurement.jsc_mA_cm2)} mA/cm²` : "—"}</dd></div><div><dt>FF</dt><dd>{numeric(selection.measurement.ff_pct) ? `${fr.format(selection.measurement.ff_pct)} %` : "—"}</dd></div></dl><small>{selection.file.source_file}</small></article>)}
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

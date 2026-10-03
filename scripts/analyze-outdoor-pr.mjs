// Read-only diagnostic: fit on earlier days and evaluate on later days.
// Never rewrites source measurements or the PR served by the application.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "data/processed/Outdoor_raw_measurements.tsv");
const quantile = (values, p) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y), index = (a.length - 1) * p;
  return a[Math.floor(index)] + (a[Math.ceil(index)] - a[Math.floor(index)]) * (index % 1);
};
const median = values => quantile(values, 0.5);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const hash = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const numeric = value => value === "" || value === undefined ? null : Number(value);
const inventoryPath = path.join(root, "data/processed/IV_dataset_normalise_Outdoor.xlsx");
const inventory = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(inventoryPath), { type: "buffer" }).Sheets.Inventory_Obs, { defval: null });
const files = new Map();
let headers, total = 0, completePositive = 0, flagged = 0;
for await (const line of readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })) {
  if (!headers) { headers = line.split("\t"); continue; }
  if (!line) continue;
  const row = Object.fromEntries(line.split("\t").map((v, i) => [headers[i], v]));
  total++;
  const group = files.get(row.source_file) ?? { sampleUid: row.sample_uid, rows: [], total: 0 };
  group.total++;
  const g = numeric(row.irradiance_W_m2), p = numeric(row.pmpp_W), pr = numeric(row.performance_ratio_pct);
  if ([g, p, pr].every(v => Number.isFinite(v) && v > 0)) {
    completePositive++;
    if (row.qa_flags) flagged++;
    group.rows.push({ g, p, pr, flags: row.qa_flags, date: row.measurement_date, timestamp: row.timestamp, sourceRow: Number(row.source_row) });
  }
  files.set(row.source_file, group);
}

function errors(rows, predict) {
  const residuals = rows.map(r => predict(r) - r.pr), abs = residuals.map(Math.abs);
  return { n: rows.length, maePp: mean(abs), rmsePp: Math.sqrt(mean(residuals.map(e => e * e))),
    medianAbsPp: median(abs), p95AbsPp: quantile(abs, 0.95), within01Pp: abs.filter(e => e <= 0.1).length / rows.length,
    within1Pp: abs.filter(e => e <= 1).length / rows.length };
}
function analyze(threshold, includeFlagged = false) {
  const results = [], pooled = { standard: [], inventoryNumericReference: [], cumulativeYield: [], powerOnly: [], freeExponent: [], offset: [] };
  for (const [source, group] of files) {
    const rows = group.rows.filter(r => r.g >= threshold && (includeFlagged || !r.flags)).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sourceRow - b.sourceRow);
    const dates = [...new Set(rows.map(r => r.date))].sort();
    if (dates.length < 4 || rows.length < 40) continue;
    // Running daily yield ratio, trapezoidal integration on eligible contiguous
    // intervals only (maximum gap 15 min); first row has instantaneous fallback.
    let previous = null, sumP = 0, sumG = 0;
    for (const row of rows) {
      if (!previous || row.date !== previous.date) { sumP = 0; sumG = 0; }
      const dt = previous && row.date === previous.date
        ? (Date.parse(row.timestamp.replace(" ", "T") + "Z") - Date.parse(previous.timestamp.replace(" ", "T") + "Z")) / 1000 : 0;
      if (dt > 0 && dt <= 900) { sumP += dt * (row.p + previous.p) / 2; sumG += dt * (row.g + previous.g) / 2; }
      row.cumulativeRatio = sumG > 0 ? sumP / sumG : row.p / row.g;
      previous = row;
    }
    const split = dates[Math.floor(dates.length / 2)], train = rows.filter(r => r.date < split), test = rows.filter(r => r.date >= split);
    if (train.length < 20 || test.length < 20) continue;
    const coefficient = median(train.map(r => r.pr * r.g / r.p));
    const rawCoefficient = median(train.map(r => r.pr / r.p));
    // PR/P = exp(intercept) G^slope. A standard inverse-irradiance rule has slope -1.
    const xs = train.map(r => Math.log(r.g)), ys = train.map(r => Math.log(r.pr / r.p));
    const mx = mean(xs), my = mean(ys);
    const variance = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
    if (variance === 0) continue;
    const slope = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0) / variance;
    const intercept = my - slope * mx;
    const normalized = train.map(r => r.p / r.g), nx = mean(normalized), py = mean(train.map(r => r.pr));
    const nv = normalized.reduce((sum, x) => sum + (x - nx) ** 2, 0);
    if (nv === 0) continue;
    const a = normalized.reduce((sum, x, i) => sum + (x - nx) * (train[i].pr - py), 0) / nv, b = py - a * nx;
    const predict = { standard: r => coefficient * r.p / r.g, cumulativeYield: r => coefficient * r.cumulativeRatio, powerOnly: r => rawCoefficient * r.p,
      freeExponent: r => r.p * Math.exp(intercept + slope * Math.log(r.g)), offset: r => a * r.p / r.g + b };
    const unaged = inventory.filter(r => r.sample_uid === group.sampleUid && r.test_type === "Unaged" && Number.isFinite(r.efficiency_pct) && r.efficiency_pct > 0);
    if (unaged.length === 1) predict.inventoryNumericReference = r => 100000 * r.p / (r.g * unaged[0].efficiency_pct);
    const scores = Object.fromEntries(Object.entries(predict).map(([name, fn]) => [name, errors(test, fn)]));
    for (const [name, fn] of Object.entries(predict)) pooled[name].push(...test.map(r => ({ pr: r.pr, prediction: fn(r) })));
    const pref = rows.map(r => 100000 * r.p / (r.g * r.pr));
    results.push({ source, sampleUid: group.sampleUid, trainN: train.length, testN: test.length,
      splitDate: split, firstDate: dates[0], lastDate: dates.at(-1), referencePowerWAssuming1000: 100000 / coefficient,
      inferredReferencePowerQ05: quantile(pref, 0.05), inferredReferencePowerQ95: quantile(pref, 0.95),
      fittedIrradianceExponent: -slope, additiveOffsetPp: b, scores,
      unagedReference: unaged.length === 1 ? { valuePct: unaged[0].efficiency_pct, observationUid: unaged[0].observation_uid,
        sourceSheet: unaged[0].source_inventory_sheet, sourceRow: unaged[0].source_inventory_row,
        numericDifferenceFromInferredReference: 100000 / coefficient - unaged[0].efficiency_pct } : null,
      verificationRows: [rows[0].sourceRow, rows.at(-1).sourceRow] });
  }
  return { threshold, includeFlagged, filesTested: results.length,
    trainN: results.reduce((n, r) => n + r.trainN, 0), testN: results.reduce((n, r) => n + r.testN, 0),
    pooled: Object.fromEntries(Object.entries(pooled).map(([name, rows]) => [name, rows.length ? errors(rows, r => r.prediction) : null])), results };
}
const scenarios = [analyze(100), analyze(200), analyze(300), analyze(200, true)];
// Reconcile first/last eligible source rows against each archived CSV, independently of TSV values.
const verifiedSources = [];
for (const result of scenarios[1].results) {
  const filename = path.join(root, "data/raw", result.source), lines = fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const columns = lines[0].split(",");
  for (const sourceRow of result.verificationRows) {
    const raw = lines[sourceRow - 1].split(",");
    const audit = files.get(result.source).rows.find(r => r.sourceRow === sourceRow);
    for (const [field, key] of [["Irr", "g"], ["PR", "pr"], ["Pmpp", "p"]]) {
      if (Math.abs(Number(raw[columns.indexOf(field)]) - audit[key]) > 1e-8) throw Error(`Source mismatch: ${result.source}:${sourceRow}:${field}`);
    }
  }
  verifiedSources.push({ source: result.source, sha256: hash(filename), columns, rowsVerified: result.verificationRows });
}
const output = { version: 1, input: "data/processed/Outdoor_raw_measurements.tsv", inputSha256: hash(input),
  laboratoryDeclaredActiveAreaCm2: 1,
  inventoryInput: "data/processed/IV_dataset_normalise_Outdoor.xlsx", inventorySha256: hash(inventoryPath),
  totalRows: total, sourceFiles: files.size, completePositiveRows: completePositive, completePositiveFlaggedRows: flagged,
  method: "Per source file; earlier half of unique dates for fitting, later half for held-out evaluation. All positive finite PR/P/G, threshold filter, recorded raw QA flags excluded unless specified. No residual-based exclusions. Reference power is inferred, not supplied STC evidence.",
  formulas: { standard: "PR_pct = 100 * (Pmpp / P_ref) * (1000 / G)", cumulativeYield: "PR_pct = (100000 / P_ref) * integral(Pmpp dt) / integral(G dt), running since first eligible row each day; trapezoids, gaps <=15 min, initial instantaneous fallback", powerOnly: "PR_pct = c * Pmpp (negative control)",
    inventoryNumericReference: "PR_pct = 100000 * raw_Pmpp / (G * inventory_Unaged_PCE_pct). No fitted parameter. Numerical relation only: physical units and active area require confirmation.",
    freeExponent: "PR_pct = c * Pmpp / G^beta (diagnostic, not a standard PR)", offset: "PR_pct = a * Pmpp/G + b (diagnostic, not a standard PR)" },
  limitations: ["Temperature-corrected PR cannot be independently tested without cell temperature and power temperature coefficient.",
    "Inferred references numerically match inventory Unaged PCE percentages; this is not a dimensional proof. CSV Pmpp units and active area require verification. The referencePowerWAssuming1000 label is conditional on the application's existing W interpretation.",
    "The implied reference power cannot identify whether the logger uses STC, an initial measurement, nominal rating or another constant.",
    "Equal-interval energy-yield normalization can be algebraically equivalent to a ratio of sums; instantaneous PR and daily medians are different outputs.",
    "Threshold and QA subsets differ from complete records; this diagnostic never replaces the logger PR."], verifiedSources, scenarios };
const destination = path.join(root, "docs/science/OUTDOOR_PR_DIAGNOSTIC_2026-10-03.json");
fs.writeFileSync(destination, JSON.stringify(output, null, 2) + "\n");
const principal = scenarios[1];
const format = value => value.toFixed(6);
const names = { standard: "PR instantané, référence ajustée sur jours antérieurs", inventoryNumericReference: "Référence PCE Unaged de l'inventaire, sans ajustement", cumulativeYield: "Ratio de rendements cumulés dans la journée", powerOnly: "Pmpp seule (contrôle négatif)", freeExponent: "Exposant d'irradiance libre (diagnostic)", offset: "Pmpp/G avec offset (diagnostic)" };
const report = `# Diagnostic de la formule PR Outdoor — 3 octobre 2026

## Conclusion

Les données sont très fortement compatibles avec une normalisation instantanée
proportionnelle à Pmpp / irradiance, avec une référence constante propre à chaque
cellule. Pour les 21 fichiers testables, la référence numérique retrouvée correspond
à la PCE Unaged de l'inventaire. Cette seconde vérification n'ajuste aucun paramètre.
Le calcul interne du logger et ses réglages ne sont pas directement observés.

Relation numérique observée (les unités brutes de Pmpp restent à confirmer) :

\`PR_pct ≈ 100000 × Pmpp_brut / (G_W_m2 × PCE_Unaged_pct)\`

Avec la surface active déclarée de **1 cm²**, cette relation est physiquement
cohérente si Pmpp est en **mW** : Pin_mW = 0,1 × G_W_m2, eta_outdoor_pct =
1000 × Pmpp_mW / G, puis PR_pct = 100 × eta_outdoor_pct / eta_Unaged_pct.
Le package interprète actuellement Pmpp comme W, alors que le CSV n'affiche
pas d'unité dans son en-tête. C'est une incohérence d'unité à résoudre, pas une
autorisation de changer silencieusement les valeurs sources.

Le PR du logger ainsi normalisé et la rétention du site (PR / référence B7)
sont deux normalisations distinctes. Cette analyse ne remplace ni l'un ni l'autre.

## Méthode et couverture

- ${total} lignes dans le TSV actif, ${files.size} fichiers sources, ${completePositive} triplets positifs et finis PR/Pmpp/G.
- Analyse principale : G ≥200 W/m², flags QA enregistrés dans les lignes brutes exclus. Pas d'exclusion fondée sur le résidu, ni application additionnelle des heuristiques de QA quotidienne du site.
- ${principal.filesTested} fichiers testés. Deux fichiers n'ont pas assez de triplets/dates éligibles pour le diagnostic.
- Par fichier : première moitié des dates pour ajuster une constante, seconde moitié pour vérifier (${principal.trainN} mesures d'ajustement, ${principal.testN} de vérification). Aucun jour partagé entre les deux moitiés d'un même fichier.
- Un fichier doit fournir au moins quatre dates et quarante mesures, avec au moins vingt mesures dans chaque moitié.
- Référence ajustée : médiane des PR × G / Pmpp sur les jours d'ajustement. Même constante conservée pour les jours ultérieurs.
- Validation indépendante de l'inventaire : référence PCE Unaged unique et positive ; aucun paramètre estimé sur les valeurs PR.
- Première et dernière ligne éligibles de chacun des 21 fichiers réconciliées avec les CSV archivés (42 triplets). Hashes du TSV, de l'inventaire et de ces CSV enregistrés dans le JSON associé.

## Comparaison sur les mesures réservées

Les erreurs sont des **points de pourcentage de PR**.

| Relation | Erreur absolue moyenne | Erreur absolue au 95e percentile |
| --- | ---: | ---: |
${Object.entries(principal.pooled).map(([name, score]) => `| ${names[name]} | ${format(score.maePp)} | ${format(score.p95AbsPp)} |`).join("\n")}

Le ratio énergétique cumulé est intégré par trapèzes sur les intervalles
contigus éligibles (écart maximal de quinze minutes), depuis le premier point
éligible de chaque journée. Le premier point utilise le ratio instantané.
Ce test ne reproduit pas un calcul énergétique journalier sur des nuits,
trous ou périodes exclues : son écart porte sur la compatibilité avec les
PR enregistrés mesure par mesure, pas sur la validité de la définition énergétique.

Les versions à exposant ou offset libre servent à examiner un écart au modèle
simple. Elles ne constituent pas d'autres définitions standards. Les exposants
estimés par fichier restent proches de 1 et n'améliorent pas la vérification
globale par rapport à la relation simple.

## Sensibilité au seuil d'irradiance

| Seuil G (W/m²), QA brute exclue | Mesures de vérification | Erreur moyenne, modèle simple (pp) |
| --- | ---: | ---: |
${scenarios.filter(s=>!s.includeFlagged).map(s=>`| ${s.threshold} | ${s.testN} | ${format(s.pooled.standard.maePp)} |`).join("\n")}

Les dates de séparation et les observations éligibles changent entre scénarios.
Ces chiffres testent la robustesse de la relation, pas un effet causal du seuil.
Une quatrième analyse incluant les flags bruts est conservée dans le JSON.

## Références par cellule

La colonne « retrouvée » est une constante numérique conditionnelle à la
convention Gref =1000. Ce n'est pas une puissance STC calibrée en W.

| Cellule | Référence numérique retrouvée | PCE Unaged (%) | Observation source |
| --- | ---: | ---: | --- |
${principal.results.map(r=>`| ${r.sampleUid} | ${format(r.referencePowerWAssuming1000)} | ${r.unagedReference.valuePct} | ${r.unagedReference.observationUid} |`).join("\n")}

## Définitions et limites

Le PR standard est un rapport de rendements électriques et d'irradiation
normalisés. Son analogue instantané utilise P/P_ref et G/G_ref.
Références : [Sandia PVPMC](https://pvpmc.sandia.gov/modeling-guide/5-ac-system-output/pv-performance-metrics/performance-ratio/)
et [IEA PVPS, Performance Loss Rate, 2021](https://pvpmc.sandia.gov/app/uploads/sites/243/2022/10/IEA-PVPS-T13-22_2021-Assessment-of-Performance-Loss-Rate-of-PV-Power-Systems-report.pdf).

- Un PR corrigé en température ne peut pas être testé indépendamment sans température cellule et coefficient thermique. La compatibilité avec un modèle simple n'est pas une preuve de calibration ou d'absence de toute correction.
- L'accord numérique avec Unaged constitue une forte indication sur la référence utilisée, sans accès à la configuration du logger.
- La médiane quotidienne de PR affichée par le site ne se confond pas avec un PR énergétique calculé par ratio d'intégrales.
- Les fichiers sans irradiance ou PR ne permettent pas ce diagnostic.
- Aucune valeur brute, agrégation quotidienne, QA ou unité du package n'a été modifiée.

Reproduction : \`node scripts/analyze-outdoor-pr.mjs\`.
Résultats détaillés : \`OUTDOOR_PR_DIAGNOSTIC_2026-10-03.json\`.
`;
fs.writeFileSync(path.join(root, "docs/science/OUTDOOR_PR_DIAGNOSTIC_2026-10-03.md"), report);
console.log(JSON.stringify({ total, sourceFiles: files.size, completePositive, flagged, scenarios: scenarios.map(({threshold,includeFlagged,filesTested,trainN,testN,pooled})=>({threshold,includeFlagged,filesTested,trainN,testN,pooled})), references: scenarios[1].results.map(r=>({sample:r.sampleUid,pref:r.referencePowerWAssuming1000,beta:r.fittedIrradianceExponent,mae:r.scores.standard.maePp,p95:r.scores.standard.p95AbsPp})) }, null, 2));

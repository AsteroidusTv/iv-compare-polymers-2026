import fs from "node:fs/promises";
import path from "node:path";

/** Resolve existing ancestors before mkdir: a symlink must not redirect a staging output into raw/public. */
export async function prepareRebuildOutput(requested, repository) {
  const root = await fs.realpath(repository);
  const target = path.resolve(requested);
  let ancestor = target;
  for (;;) {
    try { await fs.lstat(ancestor); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw Error("No existing output ancestor");
    ancestor = parent;
  }
  const canonical = path.resolve(await fs.realpath(ancestor), path.relative(ancestor, target));
  if (canonical === root || canonical.startsWith(root + path.sep)) {
    throw Error("Output must not be a production data directory");
  }
  await fs.mkdir(canonical, { recursive: true });
  if ((await fs.readdir(canonical)).length) throw Error("Output directory is not empty; refusing overwrite");
  return canonical;
}

export function validateDecisionRegistry(registry) {
  const fail = message => { throw Error(`Invalid decision registry: ${message}`); };
  if (!registry || registry.schemaVersion !== "iv-compare-decisions/1" || registry.version !== "1.0.0") fail("unsupported version");
  if (!registry.rawHashes || Array.isArray(registry.rawHashes) || typeof registry.rawHashes !== "object") fail("raw hashes");
  const sources = Object.entries(registry.rawHashes);
  if (!sources.length || sources.length > 10000) fail("source count");
  for (const [source, hash] of sources) {
    if (!/^(IV|Outdoor)\//.test(source) || source.includes("\\") || source.split("/").some(part => !part || part === ".." || part === ".") || !/^[a-f0-9]{64}$/.test(hash)) fail("source path/hash");
  }
  const limits = { inventoryIds:10000, observationIds:100000, measurementIds:100000, materialMappings:1000, recipes:1000, recipeLinks:1000, dates:10000, matching:10000, outdoor:10000, manualExclusions:10000, experimentalAdjudications:10000, outdoorMetricAdjudications:1000, ignoredRawSources:1000 };
  for (const [key, limit] of Object.entries(limits)) if (!Array.isArray(registry[key]) || registry[key].length > limit) fail(key);
  for (const key of ["materialMappings", "recipes", "recipeLinks", "dates", "matching", "outdoor", "manualExclusions", "experimentalAdjudications", "ignoredRawSources"]) {
    const targets = new Set();
    for (const item of registry[key]) {
      if (!item || !["target", "reason", "source", "status"].every(field => typeof item[field] === "string" && item[field].trim()) || !("oldValue" in item) || !("decision" in item)) fail(`${key} evidence`);
      if (targets.has(item.target)) fail(`${key} duplicate target`);
      targets.add(item.target);
    }
  }
  for (const [key, id] of [["inventoryIds","sample_uid"],["observationIds","observation_uid"],["measurementIds","measurement_uid"]]) {
    const ids = new Set();
    for (const item of registry[key]) { if (!item || typeof item[id] !== "string" || !item[id] || ids.has(item[id])) fail(`${key} duplicate/invalid identity`); ids.add(item[id]); }
  }
  for (const item of [...registry.matching, ...registry.outdoor]) if (!(item.target in registry.rawHashes)) fail("decision source missing from hashes");
  if (registry.outdoorDailyIds !== undefined) {
    if (!Array.isArray(registry.outdoorDailyIds) || registry.outdoorDailyIds.length > 100000) fail("Outdoor daily identities");
    const ids = new Set(), days = new Set();
    const samples = new Set(registry.inventoryIds.map(item => item.sample_uid));
    for (const item of registry.outdoorDailyIds) {
      const key = JSON.stringify([item.sample_uid, item.measurement_date]);
      if (!/^ODD-\d{5}$/.test(item.observation_uid) || !samples.has(item.sample_uid)
        || !/^\d{4}-\d{2}-\d{2}$/.test(item.measurement_date) || ids.has(item.observation_uid) || days.has(key)) fail("Outdoor daily duplicate/invalid identity");
      ids.add(item.observation_uid); days.add(key);
    }
  }
  const outdoorTargets = new Map(registry.outdoor.map(item => [item.target, item.decision.sample_uid]));
  const outdoorAdjudications = new Set();
  for (const item of registry.outdoorMetricAdjudications) {
    const decision = item?.decision;
    if (!item || typeof item.target !== "string" || !(item.target in registry.rawHashes)
      || typeof item.reason !== "string" || !item.reason.trim() || typeof item.source !== "string" || !item.source.trim()
      || item.status !== "owner_adjudicated_excluded" || !Number.isFinite(item.oldValue)
      || !decision || decision.scope !== "daily_aggregate" || decision.metric !== "outdoor_pr_pct"
      || decision.qa_flag !== "outdoor_pr_adjudicated_fault" || decision.irradiance_threshold_W_m2 !== 200
      || outdoorTargets.get(item.target) !== decision.sample_uid
      || !/^\d{4}-\d{2}-\d{2}$/.test(decision.measurement_date)
      || !Number.isInteger(decision.expected_daylight_count) || decision.expected_daylight_count < 3) fail("Outdoor metric adjudication evidence");
    const key = JSON.stringify([item.target, decision.sample_uid, decision.measurement_date, decision.metric]);
    if (outdoorAdjudications.has(key)) fail("duplicate Outdoor metric adjudication");
    outdoorAdjudications.add(key);
  }
  if (registry.units?.status !== "legacy_unverified" || registry.units?.decision?.voltageScaleToV !== 0.001) fail("unit interpretation requires parser version review");
  // Never silently ignore a future adjudication. A supported application policy is required before import.
  if (registry.manualExclusions.length || registry.experimentalAdjudications.length) fail("new exclusions/adjudications require explicit application-policy review");
  return registry;
}

export function validateRawCoverage(sources,registry){
 const recognised=new Set(["IV/Summary.xlsx",...registry.matching.map(item=>item.target),...registry.outdoor.map(item=>item.target),...registry.ignoredRawSources.map(item=>item.target)]);
 for(const source of sources)if(/^(IV|Outdoor)\//.test(source)&&/\.(xlsx?|csv)$/i.test(source)&&!(source in registry.rawHashes))throw Error(`New raw file requires decision registration: ${source}`);
 for(const source of Object.keys(registry.rawHashes))if(!recognised.has(source))throw Error(`Raw source lacks parsing or exclusion decision: ${source}`);
}

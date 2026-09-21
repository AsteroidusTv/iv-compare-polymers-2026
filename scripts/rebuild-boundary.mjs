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
  const limits = { inventoryIds:10000, observationIds:100000, measurementIds:100000, materialMappings:1000, recipes:1000, recipeLinks:1000, dates:10000, matching:10000, outdoor:10000, manualExclusions:10000, experimentalAdjudications:10000, ignoredRawSources:1000 };
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

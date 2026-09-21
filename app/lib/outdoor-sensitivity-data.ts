import type { outdoorSensitivity } from "./outdoor-sensitivity";
export interface OutdoorSensitivityBundle {
  schemaVersion:"outdoor-sensitivity-bundle/1";
  compatiblePackageHashes:string[];
  provenance:{registrySha256:string;rawFileHashes:Record<string,string>;pipelineVersion:string};
  analysis:ReturnType<typeof outdoorSensitivity>;
}
export function validateOutdoorBundle(value:unknown,hash:string|null):OutdoorSensitivityBundle {
  const bundle=value as OutdoorSensitivityBundle;
  if(!hash||bundle?.schemaVersion!=="outdoor-sensitivity-bundle/1"||!Array.isArray(bundle.compatiblePackageHashes)||!bundle.compatiblePackageHashes.includes(hash))throw Error("Outdoor sensitivities do not match this dataset package.");
  const analysis=bundle.analysis;
  if(analysis?.schemaVersion!=="outdoor-sensitivity/1"||!Array.isArray(analysis.daily)||!Array.isArray(analysis.summaries)||analysis.daily.length>100000||analysis.summaries.length>10000||!bundle.provenance?.registrySha256)throw Error("Invalid Outdoor sensitivity structure.");
  for(const row of analysis.daily)if(![100,200,300].includes(row.threshold)||typeof row.sampleUid!=="string"||typeof row.source!=="string"||!Number.isFinite(row.time)||![row.pr,row.pmpp,row.irradiance].every(value=>value===null||typeof value==="number"&&Number.isFinite(value))||!Array.isArray(row.retainedSourceRows)||row.retainedSourceRows.length>100000)throw Error("Invalid Outdoor daily row.");
  for(const row of analysis.summaries)if(![100,200,300].includes(row.threshold)||![3,7,14].includes(row.window)||!["pr","pmpp"].includes(row.metric)||typeof row.sampleUid!=="string"||!Array.isArray(row.daily)||row.daily.length>10000||!Array.isArray(row.baselineDates))throw Error("Invalid Outdoor scenario.");
  return bundle;
}
export async function loadOutdoorBundle(hash:string|null,signal:AbortSignal) {
  // vinext reserves .gz files as precompressed sidecars, not directly served assets.
  const response=await fetch("/data/outdoor-sensitivity-v1.ivpack",{signal});
  if(!response.ok||!response.body)throw Error("Outdoor sensitivity package unavailable. Rebuild it from raw files before using this diagnostic.");
  const bounded=async(stream:ReadableStream<Uint8Array>)=>{
    const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32_000_000)throw Error("Outdoor sensitivity package exceeds its size limit.");chunks.push(value);}}
    finally{await reader.cancel();}
    return new Blob(chunks as BlobPart[]);
  };
  let blob=await bounded(response.body);
  const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());
  // Some servers send Content-Encoding:gzip and Fetch already decodes the body.
  if(magic[0]===0x1f&&magic[1]===0x8b)blob=await bounded(blob.stream().pipeThrough(new DecompressionStream("gzip")));
  return validateOutdoorBundle(JSON.parse(await blob.text()),hash);
}

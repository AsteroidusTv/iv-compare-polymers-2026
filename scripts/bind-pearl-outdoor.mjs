// Pearl adds no Outdoor observations: preserve the existing analysis after proving that claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/decisions/light-ageing-pearl-v1.json'),'utf8'));
const bytes=await fs.readFile(path.join(root,'public/data/iv-compare-dowsil.ivpack'));
const dataset=JSON.parse(gunzipSync(bytes).toString());
const file=path.join(root,'public/data/outdoor-sensitivity-v1.ivpack');
const bundle=JSON.parse(gunzipSync(await fs.readFile(file)).toString());
if(!bundle.compatiblePackageHashes.includes(manifest.previousPackageSha256)
 ||sha(JSON.stringify(dataset.observations.filter(row=>row.test_type==='Outdoor')))!==manifest.previousOutdoorObservationsSha256
 ||dataset.provenance.decisionRegistrySha256!==bundle.provenance.registrySha256)throw Error('Cannot preserve Outdoor analysis: source/decision compatibility is unproven.');
const hash=sha(bytes);
if(!bundle.compatiblePackageHashes.includes(hash)){
 bundle.compatiblePackageHashes.push(hash);
 await fs.writeFile(file,gzipSync(Buffer.from(JSON.stringify(bundle)),{level:9}));
}
console.log('Outdoor unchanged; compatible with '+hash);

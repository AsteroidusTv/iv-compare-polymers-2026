"use client";
import { useRef, useState } from "react";
import { datasetPackageHash, type IVDataset } from "../lib/iv-data";
import { synchronizedMetrics } from "../lib/synchronized-metrics";
import { materialStyle, identityLinePattern } from "../lib/material-style";
import { buildIdentity } from "../lib/build-identity";
import { rowsCsv } from "../lib/tabular-export";
import { downloadFigureFile, downloadScientificGraphic } from "../lib/browser-figure-download";
import { InfoTip } from "./InfoTip";
import { figureTimeUnit } from "../lib/figure-language";

const labels={efficiency_pct:"PCE / PCE₀",jsc_mA_cm2:"Jsc / Jsc₀",voc_V:"Voc / Voc₀",ff_pct:"FF / FF₀"};

export function SynchronizedMetrics({dataset,materials}:{dataset:IVDataset;materials:string[]}) {
  const [protocol,setProtocol]=useState<"DH"|"TC">("DH");
  const [cutoff,setCutoff]=useState<number|null>(null);
  const [hidden,setHidden]=useState<string[]>([]),[excluded,setExcluded]=useState<string[]>([]);
  const [error,setError]=useState<string|null>(null),[manualY,setManualY]=useState(false);
  const [yMinimum,setYMinimum]=useState(0),[yMaximum,setYMaximum]=useState(120);
  const svg=useRef<SVGSVGElement>(null);
  const samples=dataset.samples.filter(sample=>materials.includes(sample.material_family)&&(sample.assigned_test===protocol||dataset.observations.some(row=>row.sample_uid===sample.sample_uid&&row.test_type===protocol)));
  const analysis=synchronizedMetrics(dataset,{sampleUids:samples.map(sample=>sample.sample_uid),protocol,graphEnd:cutoff,excludedSampleUids:excluded});
  const visibleIds=analysis.cohort.filter(id=>!hidden.includes(id));
  const allValues=analysis.panels.flatMap(panel=>panel.cells.filter(cell=>visibleIds.includes(cell.sampleUid)).flatMap(cell=>cell.value===null?[]:[cell.value]));
  const autoMin=allValues.length?Math.floor(Math.min(...allValues,100)/10)*10:0;
  const autoMax=allValues.length?Math.ceil(Math.max(...allValues,100)/10)*10+10:120;
  const validManual=Number.isFinite(yMinimum)&&Number.isFinite(yMaximum)&&yMaximum>yMinimum;
  const min=manualY&&validManual?yMinimum:autoMin,max=manualY&&validManual?yMaximum:autoMax;
  const end=cutoff??analysis.times.at(-1)??1;
  const width=1180,height=770+Math.ceil(visibleIds.length/4)*20;
  const title="Évolution synchronisée de PCE, Jsc, Voc et FF";
  const caption=`${protocol} ; ${analysis.cohort.length} cellules sélectionnées et mêmes temps exacts dans les quatre panneaux, jusqu'à ${end} ${figureTimeUnit(analysis.unit)}. Trajectoires individuelles, sans regroupement. Chaque grandeur est divisée par sa valeur Unaged unique pour la même cellule, puis multipliée par 100. Les règles de contrôle qualité sont propres à chaque grandeur ; les valeurs manquantes interrompent les courbes. Une cohorte identique n'implique pas le même n valide pour chaque grandeur. Les courbes masquées le sont uniquement à l'affichage ; les cellules exclues ne contribuent pas. Aucune interpolation.`;
  const analyticalRows=analysis.panels.flatMap(panel=>panel.cells.filter(cell=>visibleIds.includes(cell.sampleUid)).map(cell=>({metric:panel.metric,...cell,protocol,inside_viewport:cell.value!==null&&cell.value>=min&&cell.value<=max})));
  const manifest={schemaVersion:"iv-compare-synchronized-figure/1",generatedAt:new Date().toISOString(),kind:"synchronized-metrics",title,caption,sourceCode:buildIdentity,dataset:{name:dataset.name,packageSha256:datasetPackageHash(dataset),provenance:dataset.provenance},analysis,selectedSamples:samples,
    actualContributors:analysis.panels.map(panel=>({metric:panel.metric,byTime:analysis.times.map(time=>({time,sampleUids:panel.cells.filter(cell=>cell.time===time&&cell.value!==null).map(cell=>cell.sampleUid)}))})),
    display:{hidden,excluded,preset:"TM publication",width,height,viewport:{xMin:0,xMax:end,yMin:min,yMax:max},graphEnd:cutoff,manualY},analyticalRows};
  const graphic=async(format:"svg"|"png",preset:"default"|"report"="default")=>{if(!svg.current)return;setError(null);try{await downloadScientificGraphic(svg.current,width,height,manifest,"synchronized-metrics",format,preset);}catch(e){setError(String(e));}};
  return <section className="chart-card" aria-label="Synchronized metric diagnostic">
    <h3>{title} <InfoTip text="Four metrics share one specimen/time grid and individual trajectories. A missing metric is shown as missing rather than silently removing the specimen from that panel. Absolute values, references and exclusions remain in the table and exports."/></h3>
    <div className="control-row"><label>Diagnostic protocol <select value={protocol} onChange={e=>{setProtocol(e.target.value as typeof protocol);setCutoff(null);}}><option>DH</option><option>TC</option></select></label><label>Diagnostic graph end ({analysis.unit}) <input type="number" min={0} value={end} onChange={e=>setCutoff(Math.max(0,Number(e.target.value)))}/></label><button onClick={()=>setCutoff(null)}>All observed times</button>
      <label><input type="checkbox" checked={manualY} onChange={e=>setManualY(e.target.checked)}/> Manual shared Y scale</label>{manualY&&<><label>Y minimum<input type="number" value={yMinimum} onChange={e=>setYMinimum(Number(e.target.value))}/></label><label>Y maximum<input type="number" value={yMaximum} onChange={e=>setYMaximum(Number(e.target.value))}/></label></>}
    </div>{manualY&&!validManual&&<p role="alert">Y maximum must exceed Y minimum. Automatic scale remains active.</p>}
    <details><summary>Shared specimen selection — hide / exclude</summary>{samples.map(sample=><div key={sample.sample_uid}><label><input type="checkbox" checked={!hidden.includes(sample.sample_uid)} onChange={()=>setHidden(current=>current.includes(sample.sample_uid)?current.filter(id=>id!==sample.sample_uid):[...current,sample.sample_uid])}/> Show {sample.sample_uid} · {sample.material_raw||sample.material_family} · {sample.batch_no_raw||"batch unknown"}</label><label><input type="checkbox" checked={excluded.includes(sample.sample_uid)} onChange={()=>setExcluded(current=>current.includes(sample.sample_uid)?current.filter(id=>id!==sample.sample_uid):[...current,sample.sample_uid])}/> Exclude from all panels</label></div>)}</details>
    <div className="control-row">{(["svg","png"] as const).map(format=><button key={format} onClick={()=>void graphic(format)}>Export {format.toUpperCase()}</button>)}<button onClick={()=>void graphic("svg","report")}>Report SVG</button><button onClick={()=>downloadFigureFile(rowsCsv(analyticalRows),"synchronized-metrics.figure.csv","text/csv")}>Data shown in figure CSV</button><button onClick={()=>downloadFigureFile(rowsCsv(analysis.panels.flatMap(panel=>panel.traces.map(trace=>({metric:panel.metric,...trace,sourceCode:buildIdentity,dataset:manifest.dataset})))),"synchronized-metrics.full-selected.csv","text/csv")}>Full selected dataset CSV</button><button onClick={()=>downloadFigureFile(JSON.stringify(manifest,null,2),"synchronized-metrics.figure.json","application/json")}>Figure manifest JSON</button><button onClick={()=>void navigator.clipboard.writeText(caption).catch(()=>downloadFigureFile(caption,"synchronized-metrics.caption.txt","text/plain"))}>Copy caption</button></div>
    {error&&<p role="alert">{error}</p>}
    <div style={{overflowX:"auto"}}><svg ref={svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{background:"white",fontFamily:"Arial, sans-serif"}}><rect width={width} height={height} fill="white"/><text x={width/2} y={26} textAnchor="middle" fontSize={18}>{title}</text>
      {analysis.panels.map((panel,pi)=>{const left=70+(pi%2)*570,top=65+Math.floor(pi/2)*340,pw=475,ph=235;const x=(v:number)=>left+v/Math.max(1,end)*pw,y=(v:number)=>top+ph-(v-min)/(max-min)*ph;const counts=panel.counts.map(row=>row.observedN);return <g key={panel.metric}>
        <text x={left} y={top-16} fontSize={14}>{labels[panel.metric]} (%) · n={counts.length?`${Math.min(...counts)}–${Math.max(...counts)}`:"0"}/{analysis.cohort.length}</text>
        <defs><clipPath id={`sync-${panel.metric}`}><rect x={left} y={top} width={pw} height={ph}/></clipPath></defs>
        {Array.from({length:5},(_,i)=>min+(max-min)*i/4).map(v=><g key={v}><line x1={left} x2={left+pw} y1={y(v)} y2={y(v)} stroke="#ddd"/><text x={left-7} y={y(v)+4} textAnchor="end" fontSize={11}>{v.toFixed(0)}</text></g>)}
        {Array.from({length:5},(_,i)=>end*i/4).map((v,i)=><text key={i} x={x(v)} y={top+ph+20} textAnchor="middle" fontSize={11}>{v.toFixed(0)}</text>)}
        <text x={left+pw} y={top+ph+38} textAnchor="end" fontSize={12}>Temps ({figureTimeUnit(analysis.unit)})</text>
        <g clipPath={`url(#sync-${panel.metric})`}><line x1={left} x2={left+pw} y1={y(100)} y2={y(100)} stroke="#888" strokeDasharray="4 4"/>
        {visibleIds.map((id)=>{const cells=panel.cells.filter(cell=>cell.sampleUid===id),color=materialStyle(samples.find(sample=>sample.sample_uid===id)!.material_family).color;return <g key={id}>{cells.map((cell,i)=>{const prev=cells[i-1];return cell.value===null?null:<g key={cell.time}>{prev?.value!==null&&prev?.value!==undefined&&<line x1={x(prev.time)} x2={x(cell.time)} y1={y(prev.value)} y2={y(cell.value)} stroke={color} strokeWidth={1.6} strokeDasharray={identityLinePattern(id)}/>}<circle cx={x(cell.time)} cy={y(cell.value)} r={3} fill={color}><title>{id} · {cell.time} {analysis.unit}: {cell.value.toFixed(2)}%; absolute {cell.trace?.absoluteValue}, baseline {cell.trace?.baseline?.value}</title></circle></g>;})}</g>;})}</g>
        <text x={left} y={top+ph+57} fontSize={11} fill="#666">Mesures manquantes ou exclues : {panel.cells.filter(cell=>cell.value===null).length}</text>
      </g>;})}
      {visibleIds.map((id,i)=>{const sample=samples.find(row=>row.sample_uid===id)!,left=65+i%4*285,top=760+Math.floor(i/4)*20,color=materialStyle(sample.material_family).color;return <g key={id}><line x1={left} x2={left+25} y1={top} y2={top} stroke={color} strokeWidth={2} strokeDasharray={identityLinePattern(id)}/><text x={left+32} y={top+4} fontSize={10}>{id} · {sample.material_raw||sample.material_family}</text></g>;})}
    </svg></div>
    <details><summary>Shared grid, missing metrics and normalization references</summary><table><thead><tr><th>Metric</th><th>Specimen</th><th>Time</th><th>Retention (%)</th><th>Absolute</th><th>Reference</th><th>Reasons</th></tr></thead><tbody>{analysis.panels.flatMap(panel=>panel.cells.map(cell=><tr key={`${panel.metric}:${cell.sampleUid}:${cell.time}`}><td>{labels[panel.metric]}</td><td>{cell.sampleUid}</td><td>{cell.time}</td><td>{cell.value?.toFixed(2)??"Missing"}</td><td>{cell.trace?.absoluteValue??"—"}</td><td>{cell.trace?.baseline?.value??"—"}</td><td>{cell.reasons.join("; ")||"observed"}</td></tr>))}</tbody></table></details>
  </section>;
}

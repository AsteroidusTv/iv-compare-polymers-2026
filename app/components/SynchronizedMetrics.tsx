"use client";
import { figureSpecimenLabel } from "../lib/figure-language";
import { useId, useRef, useState } from "react";
import { useWorkspaceState } from "../lib/use-workspace-state";
import { ExportMenu, CopyCaption } from "./ExportMenu";
import { specimenLabel } from "../lib/public-labels";
import { datasetPackageHash, type IVDataset } from "../lib/iv-data";
import { synchronizedMetrics } from "../lib/synchronized-metrics";
import { materialStyle, markerPath } from "../lib/material-style";
import { buildIdentity } from "../lib/build-identity";
import { rowsCsv } from "../lib/tabular-export";
import { downloadFigureFile, downloadScientificGraphic } from "../lib/browser-figure-download";
import { InfoTip } from "./InfoTip";
import { figureTimeUnit, figureXAxisLabel, publicationText } from "../lib/figure-language";
import { ALL_RIBBONS, ribbonSelectionLabel } from "../lib/ribbon";
import { MetricOverlay } from "./MetricOverlay";
import { useFigurePresentation } from "./FigurePresentation";
import { figureFonts, wrapFigureText } from "../lib/figure-presentation";
import { figureNumber } from "../lib/chart-number-format";
import { figureSpecimenLabels } from "../lib/figure-legend";
import { specimenStylesById } from "../lib/material-style";

const labels={efficiency_pct:"PCE / PCE₀",jsc_mA_cm2:"Jsc / Jsc₀",voc_V:"Voc / Voc₀",ff_pct:"FF / FF₀"};

export function SynchronizedMetrics({dataset,materials,ribbonSampleIds,ribbonSelection}:{dataset:IVDataset;materials:string[];ribbonSampleIds:ReadonlySet<string>;ribbonSelection:string}) {
  const publication = useFigurePresentation(), fonts = figureFonts(publication);
  const specimenStyles = specimenStylesById(dataset.samples), specimenLabels = figureSpecimenLabels(dataset.samples);
  const clipId = useId().replace(/:/g, "");
  const [layout,setLayout]=useWorkspaceState<"panels"|"overlay">("synchronized:layout", "panels", value=>value==="panels"||value==="overlay");
  const [sampleUid,setSampleUid]=useWorkspaceState<string>("synchronized:sample", "");
  const [protocol,setProtocol]=useWorkspaceState<"DH"|"TC">("synchronized:protocol", "DH", value => value === "DH" || value === "TC");
  const [cutoff,setCutoff]=useWorkspaceState<number|null>("synchronized:cutoff", null, value => value === null || typeof value === "number" && Number.isFinite(value));
  const [hidden,setHidden]=useWorkspaceState<string[]>("synchronized:hidden", []),[excluded,setExcluded]=useWorkspaceState<string[]>("synchronized:excluded", []);
  const [error,setError]=useState<string|null>(null),[manualY,setManualY]=useWorkspaceState("synchronized:manualY", false);
  const [yMinimum,setYMinimum]=useWorkspaceState("synchronized:yMinimum", 0),[yMaximum,setYMaximum]=useWorkspaceState("synchronized:yMaximum", 120);
  const [panelScales,setPanelScales]=useWorkspaceState("synchronized:panelScales", true);
  const svg=useRef<SVGSVGElement>(null);
  const samples=dataset.samples.filter(sample=>ribbonSampleIds.has(sample.sample_uid)&&materials.includes(sample.material_family)&&(sample.assigned_test===protocol||dataset.observations.some(row=>row.sample_uid===sample.sample_uid&&row.test_type===protocol)));
  const overlay=layout==="overlay";
  const defaultSample=samples.find(sample=>dataset.observations.some(row=>row.sample_uid===sample.sample_uid&&row.test_type==="Unaged"&&[row.efficiency_pct,row.jsc_mA_cm2,row.voc_V,row.ff_pct].every(value=>typeof value==="number"&&value>0)));
  const selectedSample=samples.find(sample=>sample.sample_uid===sampleUid)??defaultSample??samples[0];
  const analysisSamples=overlay?(selectedSample?[selectedSample]:[]):samples;
  const analysis=synchronizedMetrics(dataset,{sampleUids:analysisSamples.map(sample=>sample.sample_uid),protocol,graphEnd:cutoff,excludedSampleUids:overlay?[]:excluded});
  const visibleIds=analysis.cohort.filter(id=>overlay||!hidden.includes(id));
  const allValues=analysis.panels.flatMap(panel=>panel.cells.filter(cell=>visibleIds.includes(cell.sampleUid)).flatMap(cell=>cell.value===null?[]:[cell.value]));
  const autoMin=allValues.length?Math.floor(Math.min(...allValues,100)/10)*10:0;
  const autoMax=allValues.length?Math.ceil(Math.max(...allValues,100)/10)*10+10:120;
  const validManual=Number.isFinite(yMinimum)&&Number.isFinite(yMaximum)&&yMaximum>yMinimum;
  const min=manualY&&validManual?yMinimum:autoMin,max=manualY&&validManual?yMaximum:autoMax;
  const panelBounds = new Map(analysis.panels.map(panel => {
    const values = panel.cells.filter(cell => visibleIds.includes(cell.sampleUid)).flatMap(cell => cell.value === null ? [] : [cell.value]);
    return [panel.metric, !overlay && panelScales && !(manualY && validManual)
      ? {min: values.length ? Math.floor(Math.min(...values,100)/10)*10 : 0, max: values.length ? Math.ceil(Math.max(...values,100)/10)*10+10 : 120}
      : {min,max}];
  }));
  const end=cutoff??analysis.times.at(-1)??1;
  const width=1180,height=overlay?590:770+Math.ceil(visibleIds.length/3)*70;
  const title=overlay?`Rétention de PCE, Jsc, Voc et FF — ${protocol==="DH"?"Damp Heat (DH)":"Thermal Cycling (TC)"}`:"Évolution synchronisée de PCE, Jsc, Voc et FF";
  const subtitle=selectedSample?`${specimenLabels.get(selectedSample.sample_uid)}${selectedSample.electrode?` · électrode ${selectedSample.electrode}`:""}`:"";
  const caption=publicationText(`${protocol} ; ${overlay?`une cellule (${subtitle}), quatre paramètres superposés`:`${analysis.cohort.length} cellules sélectionnées et mêmes temps exacts dans les quatre panneaux`}, jusqu'à ${figureNumber(end)} ${figureTimeUnit(analysis.unit)}. ${ribbonSelection!==ALL_RIBBONS?`Filtre : ${ribbonSelectionLabel(ribbonSelection)}. `:""}Trajectoires individuelles, sans regroupement. Chaque grandeur est divisée par sa valeur initiale unique après encapsulation pour la même cellule, puis multipliée par 100. ${!overlay && panelScales && !manualY ? "Échelles automatiques propres à chaque panneau. " : ""}Les règles de contrôle qualité sont propres à chaque grandeur ; les valeurs manquantes interrompent les courbes. Une cohorte identique n'implique pas le même n valide pour chaque grandeur. Les courbes masquées le sont uniquement à l'affichage ; les cellules exclues ne contribuent pas. Aucune interpolation.`);
  const analyticalRows=analysis.panels.flatMap(panel=>panel.cells.filter(cell=>visibleIds.includes(cell.sampleUid)).map(cell=>({metric:panel.metric,...cell,protocol,inside_viewport:cell.value!==null&&cell.value>=panelBounds.get(panel.metric)!.min&&cell.value<=panelBounds.get(panel.metric)!.max})));
  const manifest={schemaVersion:"iv-compare-synchronized-figure/1",generatedAt:new Date().toISOString(),kind:"synchronized-metrics",title,caption,sourceCode:buildIdentity,dataset:{name:dataset.name,packageSha256:datasetPackageHash(dataset),provenance:dataset.provenance},analysis,selectedSamples:analysisSamples,ribbonSelection,
    actualContributors:analysis.panels.map(panel=>({metric:panel.metric,byTime:analysis.times.map(time=>({time,sampleUids:panel.cells.filter(cell=>visibleIds.includes(cell.sampleUid)&&cell.time===time&&cell.value!==null).map(cell=>cell.sampleUid)}))})),
    display:{publication,layout,selectedSampleUid:overlay?selectedSample?.sample_uid:null,hidden:overlay?[]:hidden,excluded:overlay?[]:excluded,preset:"publication",width,height,viewport:{xMin:0,xMax:end,yMin:min,yMax:max},panelViewports:Object.fromEntries(panelBounds),graphEnd:cutoff,manualY,panelScales},analyticalRows};
  const graphic=async(format:"svg"|"png",preset:"default"|"report"="default")=>{if(!svg.current)return;setError(null);try{await downloadScientificGraphic(svg.current,width,height,manifest,"synchronized-metrics",format,preset);}catch(e){setError(String(e));}};
  return <section className="chart-card" aria-label="Synchronized metric diagnostic">
    <h3>PCE, Jsc, Voc and FF through ageing <InfoTip text="Four metrics share one specimen/time grid and individual trajectories. A missing metric is shown as missing rather than silently removing the specimen from that panel. Absolute values, references and exclusions remain in the table and exports."/></h3>
    <div className="control-row"><label>Figure layout <select value={layout} onChange={e=>setLayout(e.target.value as typeof layout)}><option value="panels">Four panels · several cells</option><option value="overlay">Overlay · one cell</option></select></label><label>Diagnostic protocol <select value={protocol} onChange={e=>{setProtocol(e.target.value as typeof protocol);setCutoff(null);}}><option value="DH">Damp heat (DH)</option><option value="TC">Thermal cycling (TC)</option></select></label>
      {overlay&&<label>Cell <select value={selectedSample?.sample_uid??""} disabled={!samples.length} onChange={e=>{setSampleUid(e.target.value);setCutoff(null);}}>{!samples.length&&<option value="">No eligible cell</option>}{samples.map(sample=><option key={sample.sample_uid} value={sample.sample_uid}>{specimenLabel(sample)}</option>)}</select></label>}
    </div>
    {overlay&&<p className="muted">One cell, each parameter normalized to its own before-ageing reference. <InfoTip text="Les couleurs, traits et symboles distinguent les paramètres, pas les matériaux. Les mesures manquantes ou exclues interrompent uniquement la courbe concernée. Les premières mesures DH/TC ne sont pas déplacées à zéro. Une baisse d'un paramètre ne démontre pas à elle seule un mécanisme physique de dégradation."/></p>}
    <div className="control-row"><label>Graph end ({analysis.unit}) <input type="number" min={0} value={end} onChange={e=>setCutoff(Math.max(0,Number(e.target.value)))}/></label><button onClick={()=>setCutoff(null)}>All observed times</button>
      {!overlay&&<label><input type="checkbox" checked={panelScales} onChange={e=>setPanelScales(e.target.checked)} disabled={manualY&&validManual}/> Panel-specific automatic scales</label>}
      <label><input type="checkbox" checked={manualY} onChange={e=>setManualY(e.target.checked)}/> Manual shared Y scale</label>{manualY&&<><label>Y minimum<input type="number" value={yMinimum} onChange={e=>setYMinimum(Number(e.target.value))}/></label><label>Y maximum<input type="number" value={yMaximum} onChange={e=>setYMaximum(Number(e.target.value))}/></label></>}
    </div>{manualY&&!validManual&&<p role="alert">Y maximum must exceed Y minimum. Automatic scale remains active.</p>}
    {!overlay&&<details><summary>Shared specimen selection — hide / exclude</summary>{samples.map(sample=><div key={sample.sample_uid}><label><input type="checkbox" checked={!hidden.includes(sample.sample_uid)} onChange={()=>setHidden(current=>current.includes(sample.sample_uid)?current.filter(id=>id!==sample.sample_uid):[...current,sample.sample_uid])}/> Show {specimenLabel(sample)}</label><label><input type="checkbox" checked={excluded.includes(sample.sample_uid)} onChange={()=>setExcluded(current=>current.includes(sample.sample_uid)?current.filter(id=>id!==sample.sample_uid):[...current,sample.sample_uid])}/> Exclude from all panels</label></div>)}</details>}
    <ExportMenu>{(["svg","png"] as const).map(format=><button key={format} onClick={()=>void graphic(format)}>Export {format.toUpperCase()}</button>)}<button onClick={()=>void graphic("svg","report")}>Report-ready SVG</button><button onClick={()=>downloadFigureFile(rowsCsv(analyticalRows),"synchronized-metrics.figure.csv","text/csv")}>Figure data · CSV</button><button onClick={()=>downloadFigureFile(rowsCsv(analysis.panels.flatMap(panel=>panel.traces.map(trace=>({metric:panel.metric,...trace,sourceCode:buildIdentity,dataset:manifest.dataset})))),"synchronized-metrics.full-selected.csv","text/csv")}>Full selected dataset CSV</button><button onClick={()=>downloadFigureFile(JSON.stringify(manifest,null,2),"synchronized-metrics.figure.json","application/json")}>Method & sources · JSON</button><CopyCaption caption={caption}/></ExportMenu>
    {error&&<p role="alert">{error}</p>}
    {!allValues.length&&<p role="status">Aucune rétention exploitable pour cette sélection. Vérifiez les références Unaged, la cellule et la fin du graphe.</p>}
    {overlay&&allValues.length>0&&analysis.panels.some(panel=>panel.cells.some(cell=>cell.value===null))&&<p role="status">Certains paramètres ont des mesures manquantes ou exclues : leurs courbes restent interrompues. Détails dans le tableau ci-dessous.</p>}
    {allValues.some(value=>value<min||value>max)&&<p role="status">Certaines valeurs sont hors de l’échelle Y choisie ; elles restent dans les données exportées.</p>}
    <div style={{overflowX:"auto"}}><svg ref={svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{background:"white",fontFamily:"Arial, sans-serif",...(overlay?{width:"100%",height:"auto"}:{})}}><rect width={width} height={height} fill="white"/><text x={overlay?32:width/2} y={28} textAnchor={overlay?"start":"middle"} fontSize={overlay?22:18} fontWeight={overlay?700:400} fill={overlay?"#17233b":"#000"}>{title}</text>
      {overlay&&selectedSample?<MetricOverlay panels={analysis.panels} sampleUid={selectedSample.sample_uid} subtitle={subtitle} min={min} max={max} end={end} unit={analysis.unit} clipId={`metric-overlay-${clipId}`}/>:null}
      {!overlay&&analysis.panels.map((panel,pi)=>{const {min:panelMin,max:panelMax}=panelBounds.get(panel.metric)!;const left=70+(pi%2)*570,top=65+Math.floor(pi/2)*340,pw=475,ph=235;const x=(v:number)=>left+v/Math.max(1,end)*pw,y=(v:number)=>top+ph-(v-panelMin)/(panelMax-panelMin)*ph;const counts=panel.counts.map(row=>row.observedN);return <g key={panel.metric}>
        <text x={left} y={top-16} fontSize={14}>{labels[panel.metric]} (%) · n={counts.length?`${Math.min(...counts)}–${Math.max(...counts)}`:"0"}/{analysis.cohort.length}</text>
        <defs><clipPath id={`sync-${panel.metric}`}><rect x={left} y={top} width={pw} height={ph}/></clipPath></defs>
        {Array.from({length:5},(_,i)=>panelMin+(panelMax-panelMin)*i/4).map(v=><g key={v}><line x1={left} x2={left+pw} y1={y(v)} y2={y(v)} stroke="#ddd"/><text className="axis-label" x={left-7} y={y(v)+4} textAnchor="end" fontSize={12}>{figureNumber(v,1)}</text></g>)}
        {Array.from({length:5},(_,i)=>end*i/4).map((v,i)=><text className="axis-label" key={i} x={x(v)} y={top+ph+20} textAnchor="middle" fontSize={12}>{figureNumber(v,1)}</text>)}
        <text x={left+pw} y={top+ph+38} textAnchor="end" fontSize={12}>{figureXAxisLabel(analysis.unit)}</text>
        <g clipPath={`url(#sync-${panel.metric})`}><line x1={left} x2={left+pw} y1={y(100)} y2={y(100)} stroke="#888" strokeDasharray="4 4"/>
        {visibleIds.map((id)=>{const cells=panel.cells.filter(cell=>cell.sampleUid===id),sample=samples.find(sample=>sample.sample_uid===id)!,color=materialStyle(sample.material_family).color,style=specimenStyles.get(id);return <g key={id}>{cells.map((cell,i)=>{const prev=cells[i-1];return cell.value===null?null:<g key={cell.time}>{prev?.value!==null&&prev?.value!==undefined&&<line x1={x(prev.time)} x2={x(cell.time)} y1={y(prev.value)} y2={y(cell.value)} stroke={color} strokeWidth={1.6} strokeDasharray={style?.dash}/>}<path d={markerPath(style?.marker,x(cell.time),y(cell.value),3)} fill="white" stroke={color}><title>{specimenLabels.get(id)} · {figureNumber(cell.time)} {analysis.unit}: {figureNumber(cell.value)} %; valeur {cell.trace?.absoluteValue}, référence {cell.trace?.baseline?.value}</title></path></g>;})}</g>;})}</g>
        <text x={left} y={top+ph+57} fontSize={11} fill="#666">Mesures manquantes ou exclues : {panel.cells.filter(cell=>cell.value===null).length}</text>
      </g>;})}
      {!overlay&&visibleIds.map((id,i)=>{const sample=samples.find(row=>row.sample_uid===id)!,left=65+i%3*375,top=760+Math.floor(i/3)*70,color=materialStyle(sample.material_family).color;return <g key={id}><line x1={left} x2={left+25} y1={top} y2={top} stroke={color} strokeWidth={2} strokeDasharray={specimenStyles.get(id)?.dash}/><path d={markerPath(specimenStyles.get(id)?.marker,left+12,top,3)} fill="white" stroke={color}/>{wrapFigureText(specimenLabels.get(id)??figureSpecimenLabel(sample),330,fonts.legend).map((line,li)=><text className="export-legend" key={li} x={left+32} y={top+4+li*(fonts.legend+4)} fontSize={fonts.legend}>{line}</text>)}</g>;})}
    </svg></div>
    <details><summary>Shared grid, missing metrics and normalization references</summary><table><thead><tr><th>Metric</th><th>Specimen</th><th>Time</th><th>Retention (%)</th><th>Absolute</th><th>Reference</th><th>Reasons</th></tr></thead><tbody>{analysis.panels.flatMap(panel=>panel.cells.map(cell=><tr key={`${panel.metric}:${cell.sampleUid}:${cell.time}`}><td>{labels[panel.metric]}</td><td>{cell.sampleUid}</td><td>{cell.time}</td><td>{cell.value?.toFixed(2)??"Missing"}</td><td>{cell.trace?.absoluteValue??"—"}</td><td>{cell.trace?.baseline?.value??"—"}</td><td>{cell.reasons.join("; ")||"observed"}</td></tr>))}</tbody></table></details>
  </section>;
}

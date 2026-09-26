"use client";
import { useRef, useState } from "react";
import { datasetPackageHash, type IVDataset } from "../lib/iv-data";
import { stagedAgeing, stagedDisplayGroups } from "../lib/staged-ageing";
import { materialStyle } from "../lib/material-style";
import { buildIdentity } from "../lib/build-identity";
import { rowsCsv } from "../lib/tabular-export";
import { downloadFigureFile, downloadScientificGraphic } from "../lib/browser-figure-download";
import { InfoTip } from "./InfoTip";
import { boxStatistics, encapsulationDisplayLabels } from "../lib/encapsulation";
import { figureStageLabel, figureTimeUnit } from "../lib/figure-language";
import { ALL_RIBBONS, recordedRibbon, ribbonLabel, ribbonSelectionLabel } from "../lib/ribbon";

export function StagedAgeing({dataset,materials,ribbonSampleIds,ribbonSelection,splitByRibbon}:{dataset:IVDataset;materials:string[];ribbonSampleIds:ReadonlySet<string>;ribbonSelection:string;splitByRibbon:boolean}) {
  const [protocol,setProtocol]=useState<"DH"|"TC">("DH");
  const [timeMode,setTimeMode]=useState<"exact"|"last-common">("exact");
  const [requestedTime,setRequestedTime]=useState<number|null>(null);
  const [retention,setRetention]=useState(false);
  const [showConnections,setShowConnections]=useState(false);
  const [groupUnknownMetadata,setGroupUnknownMetadata]=useState(false);
  const [aggregateAcrossBatches,setAggregateAcrossBatches]=useState(false);
  const [hidden,setHidden]=useState<string[]>([]),[excluded,setExcluded]=useState<string[]>([]);
  const [error,setError]=useState<string|null>(null);
  const svg=useRef<SVGSVGElement>(null);
  const samples=dataset.samples.filter(sample=>ribbonSampleIds.has(sample.sample_uid) && materials.includes(sample.material_family) && (sample.assigned_test===protocol || dataset.observations.some(row=>row.sample_uid===sample.sample_uid && row.test_type===protocol)));
  const times=[...new Set(dataset.observations.filter(row=>samples.some(sample=>sample.sample_uid===row.sample_uid)&&row.test_type===protocol&&typeof row.exposure_duration_numeric==="number").map(row=>row.exposure_duration_numeric!))].sort((a,b)=>a-b);
  const chosenTime=requestedTime ?? times[0] ?? 0;
  const sampleKey=samples.map(sample=>sample.sample_uid).join(",");
  const analysis=stagedAgeing(dataset,{sampleUids:sampleKey ? sampleKey.split(",") : [],protocol,aged:timeMode==="exact"?{mode:"exact",time:chosenTime}:{mode:"last-common"},excludedSampleUids:excluded,groupUnknownMetadata,splitByRibbon});
  const groups=stagedDisplayGroups(analysis.groups,samples,hidden,excluded,aggregateAcrossBatches,splitByRibbon);
  const sampleByUid=new Map(samples.map(sample=>[sample.sample_uid,sample]));
  const subgroupLabels=encapsulationDisplayLabels(analysis.groups.map(group=>{const sample=sampleByUid.get(group.sampleUids[0]);return {key:group.key,material:sample?.material_raw||sample?.material_family||"inconnu",batch:sample?.batch_no_raw||"inconnu",electrode:sample?.electrode||"inconnue",recipeUid:sample?.recipe_uid||null,ribbon:splitByRibbon&&sample?recordedRibbon(sample):null};}),dataset.recipes);
  const visibleSampleUids=new Set(groups.flatMap(group=>group.sampleUids));
  const visibleRows=analysis.rows.filter(row=>!row.excluded&&visibleSampleUids.has(row.sampleUid));
  const stages=retention ? ["post","aged"] as const : ["before","post","aged"] as const;
  const value=(row:typeof analysis.rows[number],stage:"before"|"post"|"aged")=>!retention ? row[stage].value : stage==="post" ? row.post.value!==null&&row.post.value>0?100:null : row.retention;
  const values=visibleRows.flatMap(row=>stages.flatMap(stage=>value(row,stage)===null?[]:[value(row,stage)!]));
  const min=values.length?Math.max(0,Math.floor(Math.min(...values))-1):0, max=values.length?Math.ceil(Math.max(...values))+1:1;
  const width=Math.max(850,groups.length*290+100),height=500;
  const y=(v:number)=>340-(v-min)/(max-min)*265;
  const title=retention?"Rétention de la PCE après vieillissement":"PCE avant / après encapsulation / après vieillissement";
  const groupingCaption=aggregateAcrossBatches?"regroupement descriptif des groupes visibles de chaque famille ; formulations et lots peuvent différer ; les groupes d'origine restent identifiables dans les données":"formulations, lots et sous-groupes de métadonnées conservés séparément";
  const missingMetadataCaption=aggregateAcrossBatches?"les métadonnées inconnues restent inconnues":groupUnknownMetadata?"métadonnées manquantes concordantes regroupées à titre descriptif":"métadonnées incomplètes conservées séparément";
  const caption=`${title}. ${protocol}, ${analysis.time===null?"aucun temps commun":`${analysis.time} ${figureTimeUnit(analysis.unit)}`} (${timeMode==="exact"?"temps exact":"dernier temps commun"}). ${groupingCaption}; ${missingMetadataCaption}. ${ribbonSelection!==ALL_RIBBONS?`Filtre : ${ribbonSelectionLabel(ribbonSelection)}. `:""}${splitByRibbon?"Les groupes sont séparés par type de ruban ; les notes de préparation brutes ne sont pas des types distincts. ":""}Points individuels et médianes ; pour n ≥ 3, boîtes Q1–Q3 (type 7) et moustaches jusqu'aux dernières valeurs observées dans 1,5 × IQR. ${showConnections?"Les lignes relient une même cellule.":"Aucune ligne entre les cellules."} Effectifs variables selon l'étape ; les mesures manquantes ne sont pas remplacées. ${retention?"100 × PCE vieillie / PCE après encapsulation ; dénominateurs nuls omis.":"PCE absolue (%)."} Mesures signalées par le contrôle qualité exclues ; aucune interpolation. L'intervalle avant/après n'est pas une estimation de la durée du procédé.`;
  const manifest={schemaVersion:"iv-compare-staged-figure/1",generatedAt:new Date().toISOString(),kind:"before-post-aged",title,caption,sourceCode:buildIdentity,dataset:{name:dataset.name,packageSha256:datasetPackageHash(dataset),provenance:dataset.provenance},selection:{materials,sampleUids:samples.map(sample=>sample.sample_uid),ribbonSelection,splitByRibbon,excluded,hidden,retention,showConnections,groupUnknownMetadata,aggregateAcrossBatches},analysis,
    stageSummaries:groups.map(group=>({group:group.key,label:group.label,materialFamily:group.materialFamily,sourceGroupKeys:group.sourceGroupKeys,stages:stages.map(stage=>{const rows=visibleRows.filter(row=>group.sampleUids.includes(row.sampleUid)&&value(row,stage)!==null);return {stage,n:rows.length,sampleUids:rows.map(row=>row.sampleUid),box:rows.length?boxStatistics(rows.map(row=>value(row,stage)!)):null,boxDrawn:rows.length>=3};})})),
    actualContributors:analysis.rows.filter(row=>!row.excluded&&stages.some(stage=>value(row,stage)!==null)).map(row=>row.sampleUid),
    display:{preset:"TM publication",width,height,viewport:{yMin:min,yMax:max},graphEnd:analysis.time,hidden:"visual_only"},
    analyticalRows:visibleRows.flatMap(row=>stages.map(stage=>({sample_uid:row.sampleUid,group:row.groupKey,stage,protocol,time:stage==="aged"?analysis.time:null,absolute_pce:row[stage].value,plotted_value:value(row,stage),baseline:retention?row.post:null,reasons:retention&&stage==="aged"?row.retentionReasons:row[stage].reasons,source:row[stage]})))};
  const saveGraphic=async(format:"svg"|"png",preset:"default"|"report"="default")=>{if(!svg.current)return;setError(null);try{await downloadScientificGraphic(svg.current,width,height,manifest,"before-post-aged",format,preset);}catch(e){setError(String(e));}};
  return <section className="chart-card" aria-label="Before Post Aged diagnostic">
    <h3>Avant → après → vieilli <InfoTip text="All specimens use one exact ageing time. Last common time requires a QA-valid value for every non-excluded selected specimen. Hide only affects visibility; exclusions change the analysis. Missing is never replaced by zero." /></h3>
    <div className="control-row"><label>Ageing protocol <select value={protocol} onChange={e=>{setProtocol(e.target.value as typeof protocol);setRequestedTime(null);}}><option>DH</option><option>TC</option></select></label>
      <label>Aged time mode <select value={timeMode} onChange={e=>setTimeMode(e.target.value as typeof timeMode)}><option value="exact">Exact time</option><option value="last-common">Last common time</option></select></label>
      {timeMode==="exact"&&<label>Exact aged time ({analysis.unit}) <input type="number" min={0} value={chosenTime} onChange={e=>setRequestedTime(Number(e.target.value))}/></label>}
      <label><input type="checkbox" checked={retention} onChange={e=>setRetention(e.target.checked)}/> Show aged / post retention</label>
      <label><input type="checkbox" checked={aggregateAcrossBatches} onChange={e=>setAggregateAcrossBatches(e.target.checked)}/> Aggregate all batches by material</label>
      <InfoTip text="Combines the currently visible groups within each selected material. This also pools any different recorded formulations or processes, so treat it as a descriptive overview. Points remain at cell level, n is shown for each stage, and the export keeps each cell's original group." />
      <label><input type="checkbox" checked={showConnections} onChange={e=>setShowConnections(e.target.checked)}/> Connect same cells</label>
      <label><input type="checkbox" checked={groupUnknownMetadata} onChange={e=>setGroupUnknownMetadata(e.target.checked)}/> Group missing metadata (descriptive)</label>
      <InfoTip text="Boxes show Q1–Q3 with the median and whiskers at observed values within 1.5 IQR, only for n≥3. Points remain visible. Descriptive grouping requires a known matching formulation and batch, while allowing matching missing process/electrode information. It does not establish process equivalence. Counts may differ between stages." />
    </div>
    <p role="status">Aged: {analysis.time===null?"No common time":`${analysis.time} ${analysis.unit}`} · whole selected cohort n before={analysis.counts.before}, post={analysis.counts.post}, aged={analysis.counts.aged}</p>
    <details><summary>Visibility and analytical exclusions</summary>{analysis.groups.map(group=>{const sample=sampleByUid.get(group.sampleUids[0]);return <div key={group.key}><label><input type="checkbox" checked={!hidden.includes(group.key)} onChange={()=>setHidden(current=>current.includes(group.key)?current.filter(key=>key!==group.key):[...current,group.key])}/> Show {sample?.material_raw||sample?.material_family||"inconnu"} · Lot {sample?.batch_no_raw||"inconnu"}{subgroupLabels.get(group.key)?` · ${subgroupLabels.get(group.key)}`:""}{splitByRibbon&&sample?` · ${ribbonLabel(recordedRibbon(sample))}`:""}</label>{group.sampleUids.map(id=><label key={id}><input type="checkbox" checked={excluded.includes(id)} onChange={()=>setExcluded(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}/> Exclude {id}</label>)}</div>;})}</details>
    <div className="control-row">{(["svg","png"] as const).map(format=><button key={format} onClick={()=>void saveGraphic(format)}>Export {format.toUpperCase()}</button>)}<button onClick={()=>void saveGraphic("svg","report")}>Report SVG</button>
      <button onClick={()=>downloadFigureFile(rowsCsv(manifest.analyticalRows),"before-post-aged.figure.csv","text/csv")}>Data shown in figure CSV</button>
      <button onClick={()=>downloadFigureFile(rowsCsv(analysis.rows.map(row=>({...row,sourceCode:buildIdentity,dataset:manifest.dataset}))),"before-post-aged.full-selected.csv","text/csv")}>Full selected dataset CSV</button>
      <button onClick={()=>downloadFigureFile(JSON.stringify(manifest,null,2),"before-post-aged.figure.json","application/json")}>Figure manifest JSON</button>
      <button onClick={()=>void navigator.clipboard.writeText(caption).catch(()=>downloadFigureFile(caption,"before-post-aged.caption.txt","text/plain"))}>Copy caption</button>
    </div>{error&&<p role="alert">{error}</p>}
    <div style={{overflowX:"auto"}}><svg ref={svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{background:"white",fontFamily:"Arial, sans-serif"}}>
      <rect width={width} height={height} fill="white"/><text x={width/2} y={28} textAnchor="middle" fontSize={18}>{title}</text><text x={width/2} y={50} textAnchor="middle" fontSize={12}>{protocol} · {analysis.time??"temps indisponible"} {figureTimeUnit(analysis.unit)} · {timeMode==="exact"?"temps exact":"dernier temps commun"}</text>
      <text x={17} y={200} transform="rotate(-90 17 200)" textAnchor="middle" fontSize={13}>{retention?"Rétention de la PCE (%)":"PCE (%)"}</text>
      {Array.from({length:6},(_,i)=>min+(max-min)*i/5).map(v=><g key={v}><line x1={60} x2={width-20} y1={y(v)} y2={y(v)} stroke="#ddd"/><text x={52} y={y(v)+4} fontSize={11} textAnchor="end">{v.toFixed(1)}</text></g>)}
      {groups.map((group,index)=>{const rows=visibleRows.filter(row=>group.sampleUids.includes(row.sampleUid)),center=80+(index+.5)*(width-100)/groups.length;const x=(i:number)=>center+(i-(stages.length-1)/2)*75;const sample=rows[0].sample,color=materialStyle(group.materialFamily).color;return <g key={group.key}>
        {stages.map((stage,i)=>{const values=rows.flatMap(row=>value(row,stage)===null?[]:[value(row,stage)!]);if(!values.length)return null;const box=boxStatistics(values);return <g key={`box-${stage}`} stroke={color} fill={color} fillOpacity={.13} aria-label={`${stage}: n=${values.length}, median=${box.median}`}>
          {values.length>=3&&<><line x1={x(i)} x2={x(i)} y1={y(box.low)} y2={y(box.high)}/>{[box.low,box.high].map((v,j)=><line key={j} x1={x(i)-9} x2={x(i)+9} y1={y(v)} y2={y(v)}/>)}<rect x={x(i)-20} y={y(box.q3)} width={40} height={Math.max(1,y(box.q1)-y(box.q3))}/></>}
          <line x1={x(i)-20} x2={x(i)+20} y1={y(box.median)} y2={y(box.median)} strokeWidth={2.5}/>
        </g>;})}
        {rows.map((row,ri)=>{const offset=(ri-(rows.length-1)/2)*Math.min(4,28/Math.max(1,rows.length-1));return <g key={row.sampleUid}>{showConnections&&stages.slice(1).map((stage,i)=>{const left=value(row,stages[i]),right=value(row,stage);return left!==null&&right!==null?<line key={stage} x1={x(i)+offset} x2={x(i+1)+offset} y1={y(left)} y2={y(right)} stroke={color} opacity={.45}/>:null;})}{stages.map((stage,i)=>{const v=value(row,stage);return v!==null?<circle key={stage} cx={x(i)+offset} cy={y(v)} r={3.5} stroke={color} fill={stage==="before"?"white":color}><title>{row.sampleUid} · {stage}: {v.toFixed(3)}</title></circle>:<text key={stage} x={x(i)+offset} y={359} fill={color} textAnchor="middle" fontSize={10}><title>{row.sampleUid}: {row[stage].reasons.join(", ")||"No valid denominator"}</title>×</text>;})}</g>;})}
        {stages.map((stage,i)=><g key={stage}><text x={x(i)} y={380} textAnchor="middle" fontSize={12}>{figureStageLabel(stage)}</text><text x={x(i)} y={397} textAnchor="middle" fontSize={11}>n = {rows.filter(row=>value(row,stage)!==null).length}</text></g>)}
        <text x={center} y={421} textAnchor="middle" fontSize={12}>{aggregateAcrossBatches?group.materialFamily:sample.material_raw||sample.material_family}</text><text x={center} y={441} textAnchor="middle" fontSize={11}>{aggregateAcrossBatches?`${group.sourceGroupKeys.length} groupes réunis`:`Lot ${sample.batch_no_raw||"inconnu"}${subgroupLabels.get(group.key)?` · ${subgroupLabels.get(group.key)}`:""}`}</text><text x={center} y={459} textAnchor="middle" fontSize={11}>{aggregateAcrossBatches?`${splitByRibbon?`${ribbonLabel(recordedRibbon(sample))} · `:""}n = ${rows.length} cellules`:`${splitByRibbon?`${ribbonLabel(recordedRibbon(sample))} · `:""}${sample.electrode||"électrode inconnue"}`}{!aggregateAcrossBatches&&group.sampleUids.length===1?` · ${group.sampleUids[0]}`:""}</text>
      </g>;})}
    </svg></div>
    <details><summary>Values, missingness and source observations</summary><table><thead><tr><th>Specimen</th><th>Before</th><th>Post</th><th>Aged</th><th>Aged / post (%)</th><th>Reasons</th></tr></thead><tbody>{analysis.rows.map(row=><tr key={row.sampleUid}><td>{row.sampleUid}</td><td>{row.before.value??"—"}</td><td>{row.post.value??"—"}</td><td>{row.aged.value??"—"}</td><td>{row.retention?.toFixed(2)??"—"}</td><td>{[...row.exclusionReasons,...row.before.reasons,...row.post.reasons,...row.aged.reasons].join("; ")||"observed"}</td></tr>)}</tbody></table></details>
  </section>;
}

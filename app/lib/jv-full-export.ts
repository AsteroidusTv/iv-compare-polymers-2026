import type { IVDataset } from "./iv-data";
import { datasetPackageHash } from "./iv-data";
import { getJVDiagnostics } from "./jv-science";
import { rowsCsv } from "./tabular-export";
import { buildIdentity } from "./build-identity";
import { seriesSamplePasses, type SeriesConfig } from "./comparison";
import { measurementQualityReasons } from "./science";

/** Records rejected sweeps separately from warnings on explicitly inspected data. */
export function jvSelectionLedger(dataset:IVDataset, measurementIds:string[], selectedIds:string[], selectedTimes:number[], includeQa:boolean, inspectUnsafe:boolean) {
 const wanted=new Set(measurementIds),selected=new Set(selectedIds),diagnostics=getJVDiagnostics(dataset),files=new Map(dataset.files.map(file=>[file.file_uid,file]));
 return dataset.measurements.filter(row=>wanted.has(row.measurement_uid)).map(row=>{
  const diagnostic=diagnostics.get(row.measurement_uid),file=files.get(row.file_uid);
  const time=file?.inferred_test_type==="Unaged"?0:file?.inferred_exposure_duration;
  const warnings=[...measurementQualityReasons(row),...(diagnostic?.issues??[])];
  const reasons:string[]=[];
  if(!selected.has(row.measurement_uid)) {
   if(!dataset.curves[row.measurement_uid]) reasons.push("no_curve_points");
   if(!includeQa&&measurementQualityReasons(row).length) reasons.push("qa_source_or_metric");
   if(!inspectUnsafe&&!diagnostic?.screeningEligible) {
    if((diagnostic?.analysis.primaryIndex??-1)<0) reasons.push("no_reviewable_primary_segment");
    if(!diagnostic?.validation.numericallyConsistent) reasons.push("numeric_consistency_unresolved");
   }
   if(typeof time!=="number"||!selectedTimes.includes(time)) reasons.push("not_selected_time");
   if(!reasons.length) reasons.push("not_selected_sweep");
  }
  return {sampleUid:row.sample_uid,measurementUid:row.measurement_uid,fileUid:row.file_uid,time,included:selected.has(row.measurement_uid),reasons,warnings,validation:diagnostic?.validation};
 });
}

export function fullJVMeasurementIds(dataset:IVDataset,configs:SeriesConfig[],mode:"ageing"|"materials",sampleUid:string|null, allowedSampleUids?: ReadonlySet<string>):string[] {
 const active=mode==="ageing"?configs.slice(0,1):configs;
 const files=new Set(dataset.files.filter(file=>(!allowedSampleUids || Boolean(file.sample_uid && allowedSampleUids.has(file.sample_uid))) && active.some(config=>seriesSamplePasses(dataset,file.sample_uid,config)
   && (file.inferred_test_type===config.stress || mode==="ageing"&&file.inferred_test_type==="Unaged"))
   && (mode!=="ageing"||sampleUid===null||file.sample_uid===sampleUid)).map(file=>file.file_uid));
 return dataset.measurements.filter(row=>files.has(row.file_uid)).map(row=>row.measurement_uid);
}

/** Full processed source-point selection: no sweep, QA, range, hiding or viewport exclusions. */
export function fullJVSelectionCsv(dataset:IVDataset,measurementIds:string[]) {
 const selected=new Set(measurementIds),diagnostics=getJVDiagnostics(dataset),files=new Map(dataset.files.map(file=>[file.file_uid,file]));
 const samples=new Map(dataset.samples.map(sample=>[sample.sample_uid,sample]));
 const rows:Record<string,unknown>[]=[];
 for(const measurement of dataset.measurements.filter(row=>selected.has(row.measurement_uid))) {
  const curve=dataset.curves[measurement.measurement_uid],diagnostic=diagnostics.get(measurement.measurement_uid),file=files.get(measurement.file_uid);
  const membership=new Map<number,string[]>();
  for(const segment of diagnostic?.analysis.segments??[])for(const point of segment.points){const ids=membership.get(point.sourceIndex)??[];ids.push(segment.id);membership.set(point.sourceIndex,ids);}
  const common={sample_uid:measurement.sample_uid,ribbon_raw:samples.get(measurement.sample_uid??"")?.ribbon_raw??null,measurement_uid:measurement.measurement_uid,file_uid:measurement.file_uid,source_file:file?.source_file,sheet:measurement.sheet_name,curve_series_index:measurement.curve_series_index,protocol:file?.inferred_test_type,time:file?.inferred_exposure_duration,surface_cm2:measurement.cell_area_cm2,unit_interpretation:diagnostic?.conversion,QA_status:diagnostic?.issues,validation:diagnostic?.validation,screening_eligible:diagnostic?.screeningEligible,quantitative_eligible:diagnostic?.quantitativeEligible,package_sha256:datasetPackageHash(dataset),source_code:buildIdentity,export_scope:"full selected processed source points, including unresolved; not all quantitatively validated",current_convention:"generated (legacy converted), not a new physical validation"};
  if(!curve){rows.push({...common,exclusion_reason:"no_curve_points"});continue;}
  curve.v.forEach((value,index)=>rows.push({...common,source_point_index:index,V:value,J:curve.j[index],segments:membership.get(index)??[],point_status:value===null||curve.j[index]===null?"non_numeric_point":"retained_full_selection"}));
 }
 return rowsCsv(rows);
}

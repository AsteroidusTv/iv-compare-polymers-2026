import XLSX from "xlsx";
export const number=value=>value===null||value===undefined||String(value).trim()===""?null:Number.isFinite(Number(String(value).replace(",",".")))?Number(String(value).replace(",",".")):null;
export const text=value=>value===null||value===undefined||value===""?null:String(value);
export function serialDate(value){return typeof value==="number"?new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10):null;}
export function calendarDate(value){
 if(typeof value==="number")return serialDate(value);
 const s=String(value??"");if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
 const m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);if(!m)return null;
 return `${m[3].length===2?"20":""}${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}
const nonempty=value=>value!==null&&value!==undefined&&value!=="";
export function parseInventory(bytes,registry){
 const workbook=XLSX.read(bytes,{cellDates:false}),samples=[],observations=[];
 const recipes=registry.recipes.map(item=>item.decision);
 for(const name of ["Lami-results","Lami-results2"]){
  if(!workbook.Sheets[name])throw Error(`Missing inventory sheet ${name}`);
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null}),offset=name.endsWith("2")?1:0;
  let sample=null;const carry={};
  for(let index=2;index<rows.length;index++){
   const row=rows[index];if(!row.some(nonempty))continue;
   const rowNumber=index+1;
   if(nonempty(row[4+offset])||nonempty(row[5+offset])){
    const identity=registry.inventoryIds.find(item=>item.source_inventory_sheet===name&&item.source_inventory_row===rowNumber);
    if(!identity)throw Error(`New inventory sample needs identity registration: ${name}:${rowNumber}`);
    if(nonempty(row[4+offset]))for(const col of [6+offset,7+offset,8+offset,9+offset])carry[col]=null;
    for(const col of [0,1,2,3+offset,4+offset,6+offset,7+offset,8+offset,9+offset])if(nonempty(row[col]))carry[col]=row[col];
    const material=text(carry[4+offset]),recipe=text(carry[6+offset]);
    const family=registry.materialMappings.find(item=>item.oldValue===material)?.decision;
    if(!family)throw Error(`Unregistered material: ${material}`);
    const dateDecision=registry.dates.find(item=>item.target===`${name}:${rowNumber}:encapsulation_date`);
    sample={sample_uid:identity.sample_uid,source_inventory_sheet:name,source_inventory_row:rowNumber,batch_no_raw:text(carry[0]),electrode:text(carry[1]),owner_or_general_comment:text(carry[2]),
     initial_efficiency_pct_raw:offset?text(row[3]):null,initial_efficiency_pct:offset?number(row[3]):null,
     encapsulation_date:dateDecision?serialDate(dateDecision.decision):calendarDate(carry[3+offset]),encapsulation_date_raw:text(carry[3+offset]),
     material_raw:material,material_family:family,sample_id_raw:text(row[5+offset]),sample_label:[material,text(row[5+offset])??"unspecified"].filter(Boolean).join(" | "),
     recipe_raw:recipe,recipe_uid:registry.recipeLinks?.find(item=>item.oldValue===recipe)?.decision??recipes.find(item=>item.recipe_raw===recipe)?.recipe_uid??null,nb_sheets_raw:text(carry[7+offset]),frame_raw:text(carry[8+offset]),ribbon_raw:text(carry[9+offset]),sample_comments:text(row[10+offset]),assigned_test:text(row[15+offset])};
    samples.push(sample);
   }
   if(!sample)continue;
   for(const [type,start,length] of [["Unaged",11+offset,5],["DH",16+offset,7],["TC",23+offset,7],["Outdoor",30+offset,3]]){
    const values=row.slice(start,start+length);if(!values.some(nonempty))continue;
    const identity=registry.observationIds.find(item=>item.source_inventory_sheet===name&&item.source_inventory_row===rowNumber&&item.test_type===type);
    if(!identity)throw Error(`New inventory observation needs identity registration: ${name}:${rowNumber}:${type}`);
    const metricKeys=["efficiency_pct","jsc_mA_cm2","voc_V","ff_pct"],parsed=type==="Outdoor"?[null,null,null,null]:values.slice(0,4).map(number);
    const flags=type==="Outdoor"?[]:metricKeys.flatMap((key,i)=>nonempty(values[i])&&parsed[i]===null?[`non_numeric_metric:${["eff","jsc","voc","ff"][i]}`]:[]);
    observations.push({observation_uid:identity.observation_uid,sample_uid:sample.sample_uid,source_inventory_sheet:name,source_row:rowNumber,test_type:type,
     exposure_duration_numeric:type==="DH"||type==="TC"?number(values[4]):null,exposure_unit:type==="DH"?"h":type==="TC"?"cycles":null,
     ...Object.fromEntries(metricKeys.map((key,i)=>[key,parsed[i]??null])),action_or_status:text(values[type==="Outdoor"?1:5]),comments:text(values[type==="Outdoor"?2:6]),data_quality_flag:flags.join(";")||null,
     raw_values:values,source_file:"IV/Summary.xlsx"});
   }
  }
 }
 if(samples.length!==registry.inventoryIds.length||observations.length!==registry.observationIds.length)throw Error(`Inventory coverage changed: ${samples.length} samples, ${observations.length} observations; review registry`);
 return {samples,observations,recipes};
}

export function parseIV(bytes,source,registry){
 const workbook=XLSX.read(bytes,{cellDates:false});
 const decision=registry.matching.find(item=>item.target===source);if(!decision)throw Error(`No matching decision: ${source}`);
 const file={...decision.decision,source_file:source,file_name:source.split("/").at(-1),measurement_group:source.split("/")[1],matching_decision:decision};
 const measurements=[],curves={},rawPoints=[];
 const identities=registry.measurementIds.filter(item=>item.source_file===source);
 for(const identity of identities){
  const sheet=workbook.Sheets[identity.sheet_name];if(!sheet)throw Error(`Missing registered sheet ${source}:${identity.sheet_name}`);
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null}),series=identity.curve_series_index,col=52+series*2;
  const headerV=text(rows[4]?.[col]),headerJ=text(rows[4]?.[col+1]);
  if(!headerV?.startsWith("V")||!headerJ||!/[IJ]/.test(headerJ))throw Error(`Unknown IV layout ${source}:${identity.sheet_name}:${series}`);
  const summary=rows[6+series]??[],area=number(summary[3]),density=/J|cm/i.test(headerJ);
  const stamp=/IV measurement of\s+(\d{2})\.(\d{2})\.(\d{4})\s+@\s+(\d{2}:\d{2}:\d{2})/.exec(String(rows[0]?.[1]??""));
  if(!stamp)throw Error(`Missing measurement timestamp ${source}:${identity.sheet_name}`);
  const points=[];
  for(let r=5;r<rows.length;r++){
   const v=number(rows[r][col]),j=number(rows[r][col+1]);if(v===null&&j===null)continue;
   const generated=j===null?null:density?-j:area!==null&&area>0?-j/area:null;
   points.push({measurement_uid:identity.measurement_uid,point_index:points.length,source_row:r+1,voltage_source_value:v,current_source_value:j,voltage_V:v===null?null:v*registry.units.decision.voltageScaleToV,generated_current_density_mA_cm2:generated});
  }
  const flags=[];
  if(!points.length)flags.push("no_curve_points");
  const eff=number(summary[7]),jsc=number(summary[4]),voc=number(summary[5]),ff=number(summary[6]);
  if(voc!==null&&(voc<0||voc>5000))flags.push("extreme_voc_mV");
  if(eff!==null&&(eff<0||eff>50))flags.push("efficiency_out_of_range");
  if(ff!==null&&(ff<0||ff>100))flags.push("ff_out_of_range");
  const curve={v:points.map(p=>p.voltage_V===null?null:Math.round(p.voltage_V*1e7)/1e7),j:points.map(p=>p.generated_current_density_mA_cm2===null?null:Math.round(p.generated_current_density_mA_cm2*1e7)/1e7)};
  const m={measurement_uid:identity.measurement_uid,file_uid:file.file_uid,sample_uid:file.sample_uid,match_status:file.match_status,sheet_name:identity.sheet_name,curve_series_index:series,
   measurement_date:`${stamp[3]}-${stamp[2]}-${stamp[1]}`,measurement_time:stamp[4],cell_number:number(summary[1]),measurement_channel:number(summary[2]),cell_area_cm2:area,
   jsc_mA_cm2:jsc,voc_V:voc===null?null:voc*.001,ff_pct:ff,efficiency_pct:eff,rsc_ohm_cm2:number(summary[8]),roc_ohm_cm2:number(summary[9]),jmpp_mA_cm2:number(summary[10]),vmpp_V:number(summary[11])===null?null:number(summary[11])*.001,pmpp_mW_cm2:number(summary[12]),
   deposition_id:text(rows[0]?.[33]),substrate_comment:text(rows[1]?.[33]),measurement_comment:text(rows[2]?.[33]),user_name:text(rows[5]?.[33]),point_count:points.length,curve_voltage_unit_source:headerV,curve_current_unit_source:headerJ,current_values_are_density:density,curve_voltage_scale_to_V:registry.units.decision.voltageScaleToV,
   curve_series_count:identities.filter(item=>item.sheet_name===identity.sheet_name).length,
   sweep_direction:points.length<2?"unknown":points.at(-1).voltage_V>points[0].voltage_V?"ascending":points.at(-1).voltage_V<points[0].voltage_V?"descending":"mixed_or_closed",
   qa_flags:flags.join(";")||null,conversion_applied:"Legacy conversion reproduced from versioned registry; unresolved physical validation",scientific_validation:{},source_file:source,source_summary_row:7+series};
  measurements.push(m);if(points.length)curves[m.measurement_uid]=curve;rawPoints.push(...points);
 }
 file.measurement_date=measurements[0]?.measurement_date??null;
 return {file,measurements,curves,rawPoints};
}

export function parseOutdoor(bytes,source,entry,metricAdjudications=[]){
 const workbook=XLSX.read(bytes,{type:"buffer",raw:true}),rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:null,raw:true});
 const installation=serialDate(entry.installation_date);
 const parsed=rows.map((row,i)=>{
  const value=String(row.Time??row.RecTime??row.time??"");
  const us=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/.exec(value);
  const iso=us?`${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}${us[4]}`:value;
  const parts=/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(iso);
  const timestamp=parts?`${parts[1]} ${parts[2].padStart(2,"0")}:${parts[3]}:${parts[4]??"00"}`:iso;
  if(!/^\d{4}-\d{2}-\d{2}[ T]/.test(timestamp))throw Error(`Unknown outdoor timestamp ${source}:${i+2}`);
  const date=timestamp.slice(0,10),irr=number(row.Irr),pr=number(row.PR),pmpp=number(row.Pmpp??row.pmpp);
  return {sample_uid:entry.sample_uid,source_file:source,source_row:i+2,timestamp,measurement_date:date,installation_date:installation,exposure_days:(Date.parse(date)-Date.parse(installation))/86400000,irradiance_W_m2:irr,performance_ratio_pct:pr,pmpp_W:pmpp,impp_A:number(row.Impp??row.impp),umpp_V:number(row.Umpp??row.umpp),qa_flags:[irr===null?"irradiance_missing":null,pr===null?"pr_missing":null].filter(Boolean).join(";")||null};
 });
 for(const adjudication of metricAdjudications){
  const decision=adjudication.decision;
  if(adjudication.target!==source||decision.sample_uid!==entry.sample_uid)throw Error(`Outdoor adjudication identity mismatch: ${source}`);
  const matching=parsed.filter(row=>row.measurement_date===decision.measurement_date);
  const daylight=matching.filter(row=>row.irradiance_W_m2!==null&&row.irradiance_W_m2>=decision.irradiance_threshold_W_m2);
  const ordered=daylight.flatMap(row=>row.performance_ratio_pct===null?[]:[row.performance_ratio_pct]).sort((a,b)=>a-b),middle=Math.floor(ordered.length/2),actual=ordered.length?(ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2):null;
  if(daylight.length!==decision.expected_daylight_count||actual===null||Math.abs(actual-adjudication.oldValue)>1e-9)throw Error(`Outdoor adjudication value/count mismatch: ${source} ${decision.measurement_date}`);
  for(const row of matching){
   row.qa_flags=[row.qa_flags,"outdoor_pr_adjudicated_fault"].filter(Boolean).join(";");
   row.qa_reason=adjudication.reason;
  }
 }
 return parsed;
}

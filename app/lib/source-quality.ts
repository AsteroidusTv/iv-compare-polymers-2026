import type { MetricKey } from "./iv-data";

const SOURCE_METRIC: Record<string, MetricKey> = { eff:"efficiency_pct", efficiency_pct:"efficiency_pct", jsc:"jsc_mA_cm2", jsc_mA_cm2:"jsc_mA_cm2", voc:"voc_V", voc_V:"voc_V", ff:"ff_pct", ff_pct:"ff_pct", pr:"outdoor_pr_pct", pmpp:"outdoor_pmpp_W", irradiance:"outdoor_irradiance_W_m2" };
const LOCAL_FLAGS: Record<string, MetricKey> = { pr_missing:"outdoor_pr_pct", pr_unavailable:"outdoor_pr_pct", outdoor_pr_adjudicated_fault:"outdoor_pr_pct", pmpp_missing:"outdoor_pmpp_W", pmpp_negative:"outdoor_pmpp_W", pmpp_without_irradiance_filter:"outdoor_pmpp_W" };
SOURCE_METRIC.light_pout_forward_mW_cm2 = "light_pout_forward_mW_cm2";
SOURCE_METRIC.light_pout_reverse_mW_cm2 = "light_pout_reverse_mW_cm2";
/** A different illumination belongs to a different experiment, even in QA inspection mode. */
export function lightIrradianceExcluded(flag: string | null | undefined): boolean {
  return Boolean(flag?.split(/[;,|]/).some(part=>part.trim()==="light_irradiance_changed"));
}
/** Only explicitly recognised metric-local flags are scoped. Irradiance absence and unknown flags remain global. */
export function sourceQualityFlagApplies(flag: string | null | undefined, metric?: MetricKey): boolean {
  if (metric === "light_pout_mean_mW_cm2") return sourceQualityFlagApplies(flag, "light_pout_forward_mW_cm2") || sourceQualityFlagApplies(flag, "light_pout_reverse_mW_cm2");
  if (!flag) return false;
  return flag.split(/[;,|]/).filter(part=>part.trim()).some(part=>{
    const value=part.trim(),match=/^non_numeric_metric:([\w]+)$/.exec(value);
    const scoped=LOCAL_FLAGS[value]??(match?SOURCE_METRIC[match[1]]:undefined);
    // With no metric, report global flags only; metric-specific issue maps own local exclusions.
    return !scoped || scoped===metric;
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import XLSX from 'xlsx';
import { validateDataset, METRICS, type IVDataset, type Observation, type MetricKey } from '../app/lib/iv-data';
import { LIGHT_METRIC_KEYS, pearlMetric } from '../app/lib/light-ageing-metrics';
import { normalizationTraces } from '../app/lib/normalization-trace';
import { arrangeTrendPanels } from '../app/lib/trend-layout';
import { sourceQualityFlagApplies } from '../app/lib/source-quality';
import { figureMetricLabel } from '../app/lib/figure-language';
import { fullSelectionCsv } from '../app/lib/figure-export';
import { axisNumberFormat } from '../app/lib/chart-number-format';

const dataset = async () => validateDataset(JSON.parse(gunzipSync(await fs.readFile('public/data/iv-compare-dowsil.ivpack')).toString()));
function traces(observations: Observation[], metric: MetricKey, includeQa = false) {
  return normalizationTraces({ observations } as IVDataset, {sampleUids: ['S'], protocol: 'Light ageing', metric, mode: 'retention', includeQa, outdoorWindow: 7, qaIssues: new Map()});
}

test('all 1908 Pearl rows retain the additional electrical and context columns from all five Excel sources', async () => {
  const data = await dataset();
  const rows = data.observations.filter(row => row.test_type === 'Light ageing');
  const manifest = JSON.parse(await fs.readFile('data/decisions/light-ageing-pearl-v1.json', 'utf8'));
  // Independent column mapping: do not reuse the ingestion registry to validate ingestion.
  const columns = {Voc: ['voc', 'V', 1], Jsc: ['jsc', 'mA_cm2', 1], FF: ['ff', 'pct', 100], Vmpp: ['vmpp', 'V', 1], Impp: ['impp', 'A', 1]} as const;
  let checked = 0;
  for (const entry of manifest.entries) {
    const book = XLSX.read(await fs.readFile(`data/raw/${entry.source}`), {type: 'buffer'});
    const source = XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets.Summary, {header: 1, defval: null});
    for (const row of rows.filter(row => row.sample_uid === entry.sample_uid)) {
      const values = source[row.source_row! - 1];
      for (const [prefix, [stem, suffix, scale]] of Object.entries(columns)) for (const [direction, letter] of [['forward', 'F'], ['reverse', 'R']]) {
        const index = source[3].findIndex(value => String(value).startsWith(`${prefix}_${letter}_`));
        assert.equal(row[`light_${stem}_${direction}_${suffix}` as MetricKey], Number(values[index]) * scale);
      }
      for (const channel of [1, 2, 3, 4] as const) for (const [prefix, key] of [['Temp', `light_temperature_${channel}_C`], ['Photo', `light_photo_${channel}_raw`]]) {
        const index = source[3].findIndex(value => String(value).startsWith(`${prefix}_${channel}_`));
        assert.equal(row[key as MetricKey], Number(values[index]));
      }
      assert.equal(row.efficiency_pct, null); // Never infer PCE from nominal illumination.
      checked++;
    }
  }
  assert.equal(checked, 1908);
  for (const row of rows) assert.doesNotMatch(`${row.action_or_status} ${row.aggregation_protocol} ${row.comments}`, /\bPearl\b/i);
});

test('all 26 metrics plot real data, retain 30 irradiation exclusions and export correct definitions', async () => {
  const data = await dataset();
  const sampleUids = [...new Set(data.observations.filter(row => row.test_type === 'Light ageing').map(row => row.sample_uid))];
  for (const metric of LIGHT_METRIC_KEYS) {
    const result = normalizationTraces(data, {sampleUids, protocol: 'Light ageing', metric, mode: 'retention', includeQa: true, outdoorWindow: 7, qaIssues: new Map()});
    assert.equal(result.length, 1908, metric);
    assert.equal(result.filter(trace => trace.value !== null).length, 1878, metric);
    assert.equal(result.filter(trace => trace.exclusions.includes('different_irradiance')).length, 30, metric);
    assert.ok(METRICS[metric].unit);
    assert.notEqual(figureMetricLabel(metric), metric);
    if (pearlMetric(metric)?.contextOnly) assert.ok(result.every(trace => trace.rule === 'absolute' && trace.baseline === null));
    else assert.ok(result.every(trace => trace.baseline?.observations[0].source_row === 7));
    for (const trace of result) assert.doesNotMatch(`${trace.baseline?.definition ?? ''} ${trace.observation.aggregation_protocol}`, /\bPearl\b/i);
  }
});

test('signed Impp means and retention preserve source signs and require both directions', () => {
  const metric = 'light_impp_mean_A';
  const observations: Observation[] = [
    {observation_uid: 'B', sample_uid: 'S', test_type: 'Light ageing', exposure_duration_numeric: 0, light_impp_forward_A: -0.02, light_impp_reverse_A: -0.04},
    {observation_uid: 'A', sample_uid: 'S', test_type: 'Light ageing', exposure_duration_numeric: 1, light_impp_forward_A: -0.01, light_impp_reverse_A: -0.02},
  ];
  const original = JSON.stringify(observations), result = traces(observations, metric);
  assert.deepEqual(result.map(trace => trace.absoluteValue), [-0.03, -0.015]);
  assert.deepEqual(result.map(trace => trace.value), [100, 50]);
  assert.equal(result[1].baseline?.status, 'valid');
  assert.equal(JSON.stringify(observations), original);
  const csv = fullSelectionCsv({analysisTrace: {a: result}});
  assert.ok(csv.includes('light_impp_forward_A') && csv.includes('light_impp_mean_A'));
  assert.equal(traces([{...observations[0], light_impp_reverse_A: null}, observations[1]], metric)[1].value, null);
});

test('additional metric QA is local, paired means inherit both directions and never change baseline', () => {
  const base: Observation = {observation_uid: 'B', sample_uid: 'S', test_type: 'Light ageing', exposure_duration_numeric: 0, light_voc_forward_V: 1, light_voc_reverse_V: 1.1, light_ff_forward_pct: 70, light_ff_reverse_pct: 80};
  const after = {...base, observation_uid: 'A', exposure_duration_numeric: 1, light_voc_forward_V: 0.9, data_quality_flag: 'non_numeric_metric:light_ff_reverse_pct'};
  assert.equal(traces([base, after], 'light_voc_forward_V')[1].value, 90);
  assert.equal(traces([base, after], 'light_ff_mean_pct')[1].value, null);
  assert.equal(sourceQualityFlagApplies(after.data_quality_flag, 'light_voc_mean_V'), false);
  assert.equal(sourceQualityFlagApplies(after.data_quality_flag, 'light_ff_mean_pct'), true);
  assert.equal(traces([{...base, light_voc_forward_V: null}, after], 'light_voc_mean_V')[1].value, null);
});

test('context is always absolute, including negative uncalibrated photodiode signals', () => {
  const base: Observation = {observation_uid: 'B', sample_uid: 'S', test_type: 'Light ageing', exposure_duration_numeric: 0, light_temperature_1_C: 40, light_photo_1_raw: -0.0002};
  assert.equal(traces([base], 'light_temperature_1_C')[0].value, 40);
  assert.equal(traces([base], 'light_photo_1_raw')[0].value, -0.0002);
  assert.equal(traces([base], 'light_photo_1_raw')[0].baseline, null);
});

test('material layout pairs only the directions of the same quantity, not Voc and Vmpp or FF and Pout', () => {
  const input = (['light_voc_forward_V', 'light_voc_reverse_V', 'light_vmpp_forward_V', 'light_ff_forward_pct', 'light_pout_forward_mW_cm2'] as MetricKey[]).map((metric, index) => ({id: String(index), config: {id: String(index), material: 'POE', stress: 'Light ageing', metric, electrode: 'all', recipe: 'all'}, xUnit: 'h', yUnit: '% of reference'}));
  const panels = arrangeTrendPanels(input, 'material');
  assert.equal(panels.length, 4);
  assert.deepEqual(panels[0].series.map(row => row.config.metric), ['light_voc_forward_V', 'light_voc_reverse_V']);
});

test('small signed signals and voltage ticks remain distinct from zero in chart labels', () => {
  const current = axisNumberFormat(0.00002);
  assert.equal(current.format(-0.0001998), '-0.0001998');
  assert.notEqual(current.format(-0.0001998), current.format(-0.000198));
  const voltage = axisNumberFormat(0.01);
  assert.notEqual(voltage.format(1.003), voltage.format(1.004));
  assert.notEqual(axisNumberFormat(1e-12).format(1e-12), '0');
});

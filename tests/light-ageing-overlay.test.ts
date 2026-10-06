import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { lightAgeingOverlay } from '../app/lib/light-ageing-overlay';
import { validateDataset, type IVDataset, type Observation } from '../app/lib/iv-data';

const row = (id: string, time: number, f: number, r: number): Observation => ({
  observation_uid: `${id}-${time}`, sample_uid: id, test_type: 'Light ageing', exposure_duration_numeric: time,
  light_pout_forward_mW_cm2: f, light_pout_reverse_mW_cm2: r,
  light_jsc_forward_mA_cm2: f, light_jsc_reverse_mA_cm2: r,
  light_voc_forward_V: f, light_voc_reverse_V: r, light_ff_forward_pct: f, light_ff_reverse_pct: r,
});
const fixture = (observations: Observation[]) => ({ samples: [{sample_uid: 'a', material_family: 'POE'}, {sample_uid: 'b', material_family: 'TPO'}], observations }) as IVDataset;

test('light overlay uses paired arithmetic means before normalization, not mean of retentions', () => {
  const data = fixture([row('a', 0, 10, 20), row('a', 1, 5, 20), row('b', 0.2, 10, 20), row('b', 1.2, 10, 10)]);
  const original = JSON.stringify(data);
  const result = lightAgeingOverlay(data, ['a', 'b', 'a'], 'mean');
  assert.equal(result.length, 2);
  for (const panel of result[0].panels) {
    assert.equal(panel.points[0].value, 100);
    assert.ok(Math.abs(panel.points[1].value! - 100 * 12.5 / 15) < 1e-10);
    assert.deepEqual(panel.points.map(p => p.time), [0, 1]);
  }
  assert.deepEqual(result[1].panels[0].points.map(p => p.time), [0.2, 1.2]);
  assert.equal(lightAgeingOverlay(data, ['a'], 'forward')[0].panels[0].points[1].value, 50);
  assert.equal(lightAgeingOverlay(data, ['a'], 'reverse')[0].panels[0].points[1].value, 100);
  assert.equal(JSON.stringify(data), original);
});

test('missing pairs and metric QA create gaps without dropping other quantities; graph end keeps full traces', () => {
  const middle = {...row('a', 1, 5, 10), light_voc_reverse_V: null, data_quality_flag: 'non_numeric_metric:light_jsc_forward_mA_cm2'};
  const result = lightAgeingOverlay(fixture([row('a', 0, 10, 20), middle, row('a', 2, 5, 10)]), ['a'], 'mean', 1)[0];
  assert.equal(result.panels[0].points[1].value, 50);
  assert.equal(result.panels[1].points[1].value, null);
  assert.equal(result.panels[2].points[1].value, null);
  assert.equal(result.panels[3].points[1].value, 50);
  assert.equal(result.panels[0].traces.length, 3);
  assert.equal(result.panels[0].points.length, 2);
});

test('invalid initial metric never substitutes a later baseline', () => {
  const first = {...row('a', 0, 10, 20), light_voc_reverse_V: null};
  const result = lightAgeingOverlay(fixture([first, row('a', 1, 5, 10)]), ['a'], 'mean')[0];
  assert.equal(result.panels[2].points[1].value, null);
  assert.equal(result.panels[2].points[1].trace?.baseline?.status, 'missing_baseline');
  assert.equal(result.panels[0].points[1].value, 50);
});

test('real light-ageing overlay retains all five cells, source rows and mandatory irradiation exclusions for every sweep', async () => {
  const data = validateDataset(JSON.parse(gunzipSync(await fs.readFile('public/data/iv-compare-dowsil.ivpack')).toString()));
  const ids = [...new Set(data.observations.filter(r => r.test_type === 'Light ageing').map(r => r.sample_uid))];
  for (const sweep of ['mean', 'forward', 'reverse'] as const) {
    const cells = lightAgeingOverlay(data, ids, sweep);
    assert.equal(cells.length, 5);
    for (const i of [0, 1, 2, 3]) {
      const points = cells.flatMap(cell => cell.panels[i].points);
      assert.equal(points.length, 1908);
      assert.equal(points.filter(p => p.reasons.includes('different_irradiance')).length, 30);
      assert.equal(points.filter(p => p.value !== null).length, 1878);
      assert.ok(points.every(p => p.trace?.baseline?.observations[0].source_row === 7));
    }
  }
});

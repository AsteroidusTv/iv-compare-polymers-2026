import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Disclosure } from '../app/components/Disclosure';
import { ExportMenu } from '../app/components/ExportMenu';
import { cellLabel, protocolLabel, readableReason, specimenLabel } from '../app/lib/public-labels';

test('public labels explain protocols and cells without mutating archived identifiers', () => {
  const sample = {sample_uid: 'SMP2-060', sample_id_raw: '1_R23', material_family: 'TPO-2 / Lenzing', batch_no_raw: 'A4'};
  assert.equal(cellLabel(sample), 'Cell 1');
  assert.equal(specimenLabel(sample), 'TPO-2 / Lenzing · Batch A4 · Cell 1');
  assert.equal(sample.sample_id_raw, '1_R23');
  assert.equal(protocolLabel('DH'), 'Damp heat (DH)');
  assert.equal(protocolLabel('TC'), 'Thermal cycling (TC)');
  assert.match(protocolLabel('Unaged'), /after encapsulation/);
  assert.equal(protocolLabel('Custom protocol'), 'Custom protocol');
  assert.equal(readableReason('missing_baseline'), 'Missing initial reference');
  assert.equal(readableReason('different_irradiance'), 'Different illumination');
});

test('secondary panels are discoverable but do not mount heavy tables or charts by default', () => {
  const html = renderToStaticMarkup(createElement(Disclosure, {title: 'Data & exclusions', description: 'Inspect source rows'}, createElement('table', null, createElement('caption', null, 'Heavy ledger'))));
  assert.match(html, /Data &amp; exclusions/);
  assert.match(html, /Inspect source rows/);
  assert.doesNotMatch(html, /<table|Heavy ledger| open=/);
});

test('figure export menu keeps all formats reachable with a purpose description', () => {
  const html = renderToStaticMarkup(createElement(ExportMenu, null, createElement('button', {type: 'button'}, 'Report-ready SVG')));
  assert.match(html, /<summary>Export figure/);
  assert.match(html, /SVG stays sharp in a report/);
  assert.match(html, /Report-ready SVG/);
  assert.doesNotMatch(html, / open=/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { repeatedSegments, segmentSimilarity } from "../app/lib/jv-segments";
const points = Array.from({length: 30}, (_, i) => ({x: i / 30, y: 20 - i / 2}));
test("exact, near and scaled repeats require independent files", () => {
  const near = points.map(p => ({x:p.x + 1e-8, y:p.y + 1e-6}));
  const scaled = points.map(p => ({x:p.x, y:10*p.y}));
  assert.equal(segmentSimilarity(points, near), "near");
  assert.equal(segmentSimilarity(points, scaled), "scaled");
  const rows = [{id:"a", file:"A", points}, {id:"b", file:"B", points:near}, {id:"c", file:"C", points:scaled}];
  for (const result of repeatedSegments(rows).values()) { assert.equal(result.independentFiles, 3); assert.equal(result.detection, "scaled"); }
  assert.ok([...repeatedSegments(rows.map(r=>({...r,file:"same"}))).values()].every(r=>r.detection === "none"));
});
test("distinct shapes, unmatched grids and incomplete short segments are not near repeats", () => {
  assert.equal(segmentSimilarity(points, points.map((p,i)=>({...p,y:p.y+(i===15?0.1:0)}))), null);
  assert.equal(segmentSimilarity(points, points.map(p=>({...p,x:p.x+0.01}))), null);
  assert.equal(segmentSimilarity(points.slice(0,5), points.slice(0,5)), null);
});

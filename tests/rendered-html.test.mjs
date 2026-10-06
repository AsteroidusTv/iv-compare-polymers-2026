import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handleRequest } = await import(workerUrl.href);
  return handleRequest(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }));
}

test("server-renders the IV Compare application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>IV Compare — Polymers &amp; ageing<\/title>/i);
  assert.match(html, /Comparison workspace/i);
  assert.match(html, /Dataset &amp; downloads/i);
  assert.match(html, /aria-busy="true"/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.match(html, /href="\/guide"/);
  assert.match(html, /Scientific settings/);
  assert.match(html, /Current method/);
  assert.doesNotMatch(html, /\bPearl\b/i);
  assert.doesNotMatch(html, /Internal tool|within each patch|TM publication/i);
  assert.match(html, /Photovoltaic encapsulant study/);
  assert.match(html, /Choose cells/);
  assert.match(html, /Data, references &amp; exclusions/);
});

test("guide renders without a dataset and its chapter links resolve to real sections", async () => {
  const response = await render("/guide");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Guide &amp; scientific methods/);
  assert.match(html, /Screening ≠ validation/);
  assert.doesNotMatch(html, /Open laboratory questions|What still needs laboratory confirmation|id="limits"/);
  const chapterLinks = [...html.matchAll(/href="#([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(chapterLinks.length >= 9);
  for (const anchor of chapterLinks) assert.ok(html.includes(`id="${anchor}"`), `Missing guide target: ${anchor}`);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /Loading dataset/);
  assert.doesNotMatch(html, /\bPearl\b/i);
  assert.doesNotMatch(html, /Internal tool|laboratory Trash/i);
  assert.match(html, /Export figure/);
});

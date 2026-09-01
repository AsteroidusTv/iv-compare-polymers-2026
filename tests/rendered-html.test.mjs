import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handleRequest } = await import(workerUrl.href);
  return handleRequest(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("server-renders the IV Compare application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>IV Compare — Polymers &amp; ageing<\/title>/i);
  assert.match(html, /Comparison workspace/i);
  assert.match(html, /Import data/i);
  assert.match(html, /aria-busy="true"/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

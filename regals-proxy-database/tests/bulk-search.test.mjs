import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/bulk-search.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(fetch) {
  const exports = {};
  new Function("exports", "fetch", "setTimeout", compiled)(exports, fetch, (callback) => callback());
  return exports;
}

test("parses quantities, blank lines and duplicates while preserving punctuation", () => {
  const { parseCardList } = load();
  assert.deepEqual(parseCardList("4 Sol Ring\r\n\n1x Fire // Ice\nsol ring\n2 Thalia, Guardian of Thraben"),
    ["sol ring", "Fire // Ice", "Thalia, Guardian of Thraben"]);
});

test("fetches every batch and page, deduplicates cards and reports missing names", async () => {
  const requests = [];
  const { searchCardList } = load(async (url) => {
    requests.push(new URL(url, "http://localhost"));
    if (requests.length === 3) return new Response(null, { status: 404 });
    return Response.json({ data: [{ id: "a", name: "Fire // Ice", card_faces: [{ name: "Fire" }, { name: "Ice" }] }], has_more: requests.length === 1 });
  });
  const result = await searchCardList(["Fire", ...Array.from({ length: 20 }, (_, i) => `Card ${i}`)].join("\n"), "in:paper legal:edh");
  assert.equal(requests.length, 3);
  assert.equal(requests[1].searchParams.get("page"), "2");
  assert.match(requests[0].searchParams.get("q"), /\) in:paper legal:edh$/);
  assert.equal(result.data.length, 1);
  assert.equal(result.missing.length, 20);
  assert.equal(result.total, 21);
});

test("rejects empty or oversized lists without fetching", async () => {
  const { searchCardList } = load(() => assert.fail("Unexpected fetch"));
  await assert.rejects(searchCardList(" \n", ""), /at least one/);
  await assert.rejects(searchCardList(Array.from({ length: 501 }, (_, i) => `Card ${i}`).join("\n"), ""), /500/);
});

test("upstream errors are failures rather than missing cards", async () => {
  const { searchCardList } = load(async () => Response.json({ details: "Try again later" }, { status: 429 }));
  await assert.rejects(searchCardList("Sol Ring", ""), /Try again later/);
});

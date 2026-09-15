import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/api/proxies/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadRoute() {
  const writes = [];
  const collection = {
    find: () => ({ project: () => ({ toArray: async () => [{ id: "a" }, { id: "b" }] }) }),
    bulkWrite: async (operations) => writes.push(...operations),
    findOneAndUpdate: async (filter, update) => ({ id: filter.id, ...update.$set }),
  };
  const exports = {};
  const mockedRequire = (name) => name === "@/lib/mongodb"
    ? { getProxyCollection: async () => collection }
    : require(name);
  new Function("exports", "require", compiled)(exports, mockedRequire);
  return { route: exports, writes };
}

function request(body, query = "") {
  return new Request(`http://localhost/api/proxies${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const [branch, body, query] of [
  ["main", { baseCardId: "card", proxyIds: ["b", "a"] }, ""],
  ["universes-beyond-page", { orderedIds: ["b", "a"] }, "?cardId=card"],
]) {
  test(`saves ordering from the ${branch} client for both database formats`, async () => {
    const { route, writes } = loadRoute();
    assert.equal((await route.PATCH(request(body, query))).status, 200);
    assert.deepEqual(writes.map(({ updateOne }) => ({
      id: updateOne.filter.id,
      card: updateOne.filter.baseCardId,
      mainOrder: updateOne.update.$set.sortOrder,
      branchOrder: updateOne.update.$set.displayOrder,
    })), [
      { id: "b", card: "card", mainOrder: 0, branchOrder: 0 },
      { id: "a", card: "card", mainOrder: 1, branchOrder: 1 },
    ]);
  });
}

for (const [ids, expectedStatus] of [
  [["a", "a"], 400],
  [[], 400],
  ["a", 400],
  [["a"], 409],
  [["a", "foreign-card-proxy"], 409],
]) {
  test(`rejects invalid or stale ordering ${JSON.stringify(ids)} without writing`, async () => {
    const { route, writes } = loadRoute();
    assert.equal((await route.PATCH(request({ baseCardId: "card", proxyIds: ids }))).status, expectedStatus);
    assert.equal(writes.length, 0);
  });
}

test("credit editing remains available alongside the ordering endpoint", async () => {
  const { route } = loadRoute();
  const response = await route.PATCH(request({ creator: "Creator", artist: "Artist" }, "?id=a"));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.creator, "Creator");
  assert.equal(data.artist, "Artist");
});

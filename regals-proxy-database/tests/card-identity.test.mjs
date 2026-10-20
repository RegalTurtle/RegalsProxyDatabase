import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, fetchMock) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", "fetch", compiled)(exports, (name) => mocks[name] ?? require(name), fetchMock);
  return exports;
}

test("backfills older Plains printings to one identity without changing image or printing fields", async () => {
  const rows = [
    { id: "a", baseCardId: "old-plains", imageUrl: "image-a" },
    { id: "b", baseCardId: "new-plains", imageUrl: "image-b" },
  ];
  const original = structuredClone(rows);
  let requests = 0;
  const identity = load("../lib/card-identity.ts", {}, async (_url, options) => {
    requests++;
    const { identifiers } = JSON.parse(options.body);
    return Response.json({ data: identifiers.map(({ id }) => ({ id, oracle_id: "plains" })) });
  });
  const collection = {
    distinct: async () => rows.filter((row) => !row.oracleId).map((row) => row.baseCardId),
    bulkWrite: async (operations) => {
      for (const { updateMany } of operations) {
        for (const row of rows.filter((row) => row.baseCardId === updateMany.filter.baseCardId)) {
          Object.assign(row, updateMany.update.$set);
        }
      }
    },
  };
  await identity.backfillOracleIds(collection);
  await identity.backfillOracleIds(collection);
  assert.deepEqual(rows, original.map((row) => ({ ...row, oracleId: "plains" })));
  assert.equal(requests, 1);
});

test("failed identity lookup preserves records and allows a later retry", async () => {
  let fail = true;
  const identity = load("../lib/card-identity.ts", {}, async () => fail
    ? new Response("Unavailable", { status: 503 })
    : Response.json({ data: [{ id: "printing", oracle_id: "plains" }] }));
  const writes = [];
  const collection = { distinct: async () => ["printing"], bulkWrite: async (ops) => writes.push(...ops) };
  await assert.rejects(identity.backfillOracleIds(collection), /Could not resolve/);
  assert.equal(writes.length, 0);
  fail = false;
  await identity.backfillOracleIds(collection);
  assert.equal(writes[0].updateMany.update.$set.oracleId, "plains");
});

test("different Plains printing pages load the same gallery and summaries", async () => {
  const galleries = [
    { id: "a", baseCardId: "old-plains", oracleId: "plains" },
    { id: "b", baseCardId: "new-plains", oracleId: "plains" },
  ];
  const collection = {
    aggregate: (pipeline) => {
      const match = pipeline[0].$match;
      assert.ok(match.oracleId);
      return { toArray: async () => typeof match.oracleId === "string"
        ? galleries.filter((row) => row.oracleId === match.oracleId)
        : [{ _id: "plains", count: 2, latestImageUrl: "image-a" }] };
    },
  };
  const route = load("../app/api/proxies/route.ts", {
    "@/lib/mongodb": { getProxyCollection: async () => collection },
    "@/lib/card-identity": {
      backfillOracleIds: async () => {},
      resolveOracleIds: async (ids) => new Map(ids.map((id) => [id, "plains"])),
    },
  });
  for (const id of ["old-plains", "new-plains"]) {
    const response = await route.GET(new Request(`http://localhost/api/proxies?cardId=${id}`));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, galleries);
  }
  const response = await route.GET(new Request("http://localhost/api/proxies?cardIds=old-plains,new-plains"));
  const payload = await response.json();
  assert.deepEqual(payload.counts, { "old-plains": 2, "new-plains": 2 });
  assert.equal(payload.latestProxies["new-plains"].imageUrl, "image-a");
});

test("new uploads use the server identity and append to the shared printing order", async () => {
  let saved;
  const collection = {
    aggregate: (pipeline) => {
      assert.deepEqual(pipeline[0].$match, { oracleId: "plains" });
      return { next: async () => ({ effectiveOrder: 3 }) };
    },
    insertOne: async (proxy) => { saved = proxy; },
  };
  const route = load("../app/api/proxies/route.ts", {
    "@/lib/mongodb": { getProxyCollection: async () => collection },
    "@/lib/card-identity": {
      backfillOracleIds: async () => {},
      resolveOracleIds: async () => new Map([["new-plains", "plains"]]),
    },
  });
  const response = await route.POST(new Request("http://localhost/api/proxies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseCardId: "new-plains", baseCardName: "Plains", oracleId: "wrong", imageUrl: "image" }),
  }));
  assert.equal(response.status, 201);
  assert.equal(saved.oracleId, "plains");
  assert.equal(saved.baseCardId, "new-plains");
  assert.equal(saved.sortOrder, 4);
});

import type { Collection } from "mongodb";

const oracleIds = new Map<string, string>();

// Resolve printing IDs on the server; never trust a client-supplied Oracle ID.
export async function resolveOracleIds(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => !oracleIds.has(id));
  for (let index = 0; index < missing.length; index += 75) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 100));
    const batch = missing.slice(index, index + 75);
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
      },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Could not resolve card identities from Scryfall. Please try again.");
    const payload = await response.json() as { data?: { id: string; oracle_id?: string }[] };
    for (const card of payload.data ?? []) {
      if (card.oracle_id) oracleIds.set(card.id, card.oracle_id);
    }
    if (batch.some((id) => !oracleIds.has(id))) {
      throw new Error("Scryfall could not identify a saved card printing. Proxy records have been preserved.");
    }
  }
  return new Map(ids.map((id) => [id, oracleIds.get(id)!]));
}

let migration: Promise<void> | undefined;

// Backfill existing records without moving images or changing their printing IDs.
// Repeat the scan so uploads from an older running deployment are included too.
export async function backfillOracleIds(collection: Collection) {
  if (!migration) {
    migration = (async () => {
      const filter = { oracleId: { $in: [null, ""] } };
      const ids = await collection.distinct<string>("baseCardId", filter);
      if (!ids.length) return;
      const identities = await resolveOracleIds(ids);
      await collection.bulkWrite(ids.map((baseCardId) => ({
        updateMany: {
          filter: { ...filter, baseCardId },
          update: { $set: { oracleId: identities.get(baseCardId) } },
        },
      })));
    })().finally(() => { migration = undefined; });
  }
  await migration;
}

import { randomUUID } from "node:crypto";
import { getProxyCollection } from "@/lib/mongodb";
import { backfillOracleIds, resolveOracleIds } from "@/lib/card-identity";

export const runtime = "nodejs";

type ProxyPayload = {
  baseCardId?: string;
  baseCardName?: string;
  creator?: string;
  artist?: string;
  imageUrl?: string;
  storageKey?: string;
  orderedIds?: string[];
  proxyIds?: string[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asSearchRegex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

// Read orders saved by either branch without requiring a database migration.
const effectiveOrder = { $ifNull: ["$sortOrder", "$displayOrder"] };

function proxyProjection() {
  return {
    _id: 0,
    id: 1,
    baseCardId: 1,
    oracleId: 1,
    baseCardName: 1,
    creator: 1,
    artist: 1,
    imageUrl: 1,
    storageKey: 1,
    createdAt: 1,
    updatedAt: 1,
    displayOrder: 1,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const collection = await getProxyCollection();
    await backfillOracleIds(collection);
    const recentCards = Number(url.searchParams.get("recentCards") ?? 0);
    const cardIds = url.searchParams.get("cardIds");

    if (recentCards > 0) {
      const data = await collection
        .aggregate([
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$oracleId",
              baseCardId: { $first: "$baseCardId" },
              baseCardName: { $first: "$baseCardName" },
              latestProxyAt: { $first: "$createdAt" },
            },
          },
          { $sort: { latestProxyAt: -1 } },
          { $limit: Math.min(recentCards, 100) },
          { $project: { _id: 0, baseCardId: 1, baseCardName: 1, latestProxyAt: 1 } },
        ])
        .toArray();

      return Response.json({ data });
    }

    if (cardIds) {
      const ids = cardIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const identities = await resolveOracleIds(ids);
      const counts = await collection
        .aggregate([
          { $match: { oracleId: { $in: [...identities.values()] } } },
          { $addFields: { effectiveOrder } },
          { $sort: { effectiveOrder: 1, createdAt: -1, id: 1 } },
          {
            $group: {
              _id: "$oracleId",
              count: { $sum: 1 },
              latestImageUrl: { $first: "$imageUrl" },
              latestProxyAt: { $first: "$createdAt" },
            },
          },
        ])
        .toArray();

      const byOracle = new Map(counts.map((row) => [row._id as string, row]));
      return Response.json({
        counts: Object.fromEntries(ids.map((id) => [id, byOracle.get(identities.get(id)!)?.count ?? 0])),
        latestProxies: Object.fromEntries(ids.map((id) => {
          const row = byOracle.get(identities.get(id)!);
          return [id, { imageUrl: row?.latestImageUrl, createdAt: row?.latestProxyAt }];
        })),
      });
    }

    const cardId = url.searchParams.get("cardId")?.trim();
    const oracleId = cardId ? (await resolveOracleIds([cardId])).get(cardId) : undefined;
    const proxyCreator = url.searchParams.get("proxyCreator")?.trim();
    const proxyArtist = url.searchParams.get("proxyArtist")?.trim();
    const filter = {
      ...(oracleId ? { oracleId } : {}),
      ...(proxyCreator ? { creator: asSearchRegex(proxyCreator) } : {}),
      ...(proxyArtist ? { artist: asSearchRegex(proxyArtist) } : {}),
    };
    const data = await collection.aggregate([
      { $match: filter },
      { $addFields: { effectiveOrder } },
      { $sort: { effectiveOrder: 1, createdAt: -1, id: 1 } },
      { $project: proxyProjection() },
    ]).toArray();

    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load proxies." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProxyPayload;
    const baseCardId = asString(payload.baseCardId);
    const baseCardName = asString(payload.baseCardName);
    const imageUrl = asString(payload.imageUrl);

    if (!baseCardId || !baseCardName || !imageUrl) {
      return Response.json({ error: "baseCardId, baseCardName, and imageUrl are required." }, { status: 400 });
    }

    const collection = await getProxyCollection();
    await backfillOracleIds(collection);
    const oracleId = (await resolveOracleIds([baseCardId])).get(baseCardId)!;
    const now = new Date().toISOString();
    const lastProxy = await getProxyCollection().then((collection) =>
      collection.aggregate([
        { $match: { oracleId } },
        { $addFields: { effectiveOrder } },
        { $sort: { effectiveOrder: -1 } },
        { $limit: 1 },
      ]).next(),
    );
    const proxy = {
      id: randomUUID(),
      baseCardId,
      baseCardName,
      oracleId,
      creator: asString(payload.creator) || "Unknown creator",
      artist: asString(payload.artist) || "Unknown artist",
      imageUrl,
      storageKey: asString(payload.storageKey) || undefined,
      createdAt: now,
      updatedAt: now,
      sortOrder: typeof lastProxy?.effectiveOrder === "number" ? lastProxy.effectiveOrder + 1 : 0,
      displayOrder: typeof lastProxy?.effectiveOrder === "number" ? lastProxy.effectiveOrder + 1 : 0,
    };

    await collection.insertOne(proxy);

    return Response.json({ data: proxy }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save proxy." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const payload = (await request.json()) as ProxyPayload;
    const cardId = url.searchParams.get("cardId")?.trim() || asString(payload.baseCardId);
    const orderedIds = payload.orderedIds ?? payload.proxyIds;

    if (orderedIds !== undefined) {
      if (!cardId) {
        return Response.json({ error: "Card id is required when saving proxy order." }, { status: 400 });
      }

      if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.some((proxyId) => !asString(proxyId)) || new Set(orderedIds).size !== orderedIds.length) {
        return Response.json({ error: "A non-empty ordered proxy id list is required." }, { status: 400 });
      }

      const collection = await getProxyCollection();
      await backfillOracleIds(collection);
      const oracleId = (await resolveOracleIds([cardId])).get(cardId)!;
      const existing = await collection.find({ oracleId }).project({ id: 1 }).toArray();
      const existingIds = new Set(existing.map((proxy) => proxy.id));
      if (existing.length !== orderedIds.length || orderedIds.some((proxyId) => !existingIds.has(proxyId))) {
        return Response.json({ error: "The proxy list changed. Refresh the page before reordering." }, { status: 409 });
      }
      await collection.bulkWrite(orderedIds.map((proxyId, displayOrder) => ({
        updateOne: {
          filter: { id: proxyId, oracleId },
          update: { $set: { displayOrder, sortOrder: displayOrder, updatedAt: new Date().toISOString() } },
        },
      })));

      return Response.json({ ok: true });
    }

    if (!id) {
      return Response.json({ error: "Proxy id is required." }, { status: 400 });
    }

    const creator = asString(payload.creator);
    const artist = asString(payload.artist);

    if (!creator || !artist) {
      return Response.json({ error: "Creator and artist are required." }, { status: 400 });
    }

    const collection = await getProxyCollection();
    const result = await collection.findOneAndUpdate(
      { id },
      { $set: { creator, artist, updatedAt: new Date().toISOString() } },
      { returnDocument: "after", projection: proxyProjection() },
    );

    if (!result) {
      return Response.json({ error: "Proxy not found." }, { status: 404 });
    }

    return Response.json({ data: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update proxy." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();

    if (!id) {
      return Response.json({ error: "Proxy id is required." }, { status: 400 });
    }

    const collection = await getProxyCollection();
    const result = await collection.deleteOne({ id });

    if (!result.deletedCount) {
      return Response.json({ error: "Proxy not found." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete proxy." }, { status: 500 });
  }
}

import { randomUUID } from "node:crypto";
import { getProxyCollection } from "@/lib/mongodb";

export const runtime = "nodejs";

type ProxyPayload = {
  baseCardId?: string;
  baseCardName?: string;
  creator?: string;
  artist?: string;
  imageUrl?: string;
  storageKey?: string;
  orderedIds?: string[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asSearchRegex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function proxyProjection() {
  return {
    _id: 0,
    id: 1,
    baseCardId: 1,
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
    const recentCards = Number(url.searchParams.get("recentCards") ?? 0);
    const cardIds = url.searchParams.get("cardIds");

    if (recentCards > 0) {
      const data = await collection
        .aggregate([
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$baseCardId",
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
      const counts = await collection
        .aggregate([
          { $match: { baseCardId: { $in: ids } } },
          { $sort: { displayOrder: 1, createdAt: 1 } },
          {
            $group: {
              _id: "$baseCardId",
              count: { $sum: 1 },
              latestImageUrl: { $first: "$imageUrl" },
              latestProxyAt: { $first: "$createdAt" },
            },
          },
        ])
        .toArray();

      return Response.json({
        counts: Object.fromEntries(
          counts.map((item) => {
            const row = item as { _id: string; count: number };
            return [row._id, row.count];
          }),
        ),
        latestProxies: Object.fromEntries(
          counts.map((item) => {
            const row = item as { _id: string; latestImageUrl?: string; latestProxyAt?: string };
            return [row._id, { imageUrl: row.latestImageUrl, createdAt: row.latestProxyAt }];
          }),
        ),
      });
    }

    const cardId = url.searchParams.get("cardId")?.trim();
    const proxyCreator = url.searchParams.get("proxyCreator")?.trim();
    const proxyArtist = url.searchParams.get("proxyArtist")?.trim();
    const filter = {
      ...(cardId ? { baseCardId: cardId } : {}),
      ...(proxyCreator ? { creator: asSearchRegex(proxyCreator) } : {}),
      ...(proxyArtist ? { artist: asSearchRegex(proxyArtist) } : {}),
    };
    const data = await collection.find(filter).project(proxyProjection()).sort({ displayOrder: 1, createdAt: 1 }).toArray();

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

    const now = new Date().toISOString();
    const lastProxy = await getProxyCollection().then((collection) =>
      collection.find({ baseCardId }).sort({ displayOrder: -1, createdAt: -1 }).limit(1).next(),
    );
    const proxy = {
      id: randomUUID(),
      baseCardId,
      baseCardName,
      creator: asString(payload.creator) || "Unknown creator",
      artist: asString(payload.artist) || "Unknown artist",
      imageUrl,
      storageKey: asString(payload.storageKey) || undefined,
      createdAt: now,
      updatedAt: now,
      displayOrder: typeof lastProxy?.displayOrder === "number" ? lastProxy.displayOrder + 1 : undefined,
    };

    const collection = await getProxyCollection();
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
    const cardId = url.searchParams.get("cardId")?.trim();
    const payload = (await request.json()) as ProxyPayload;

    if (payload.orderedIds) {
      if (!cardId) {
        return Response.json({ error: "Card id is required when saving proxy order." }, { status: 400 });
      }

      if (!payload.orderedIds.length || payload.orderedIds.some((proxyId) => !asString(proxyId))) {
        return Response.json({ error: "A non-empty ordered proxy id list is required." }, { status: 400 });
      }

      const collection = await getProxyCollection();
      await Promise.all(
        payload.orderedIds.map((proxyId, displayOrder) =>
          collection.updateOne(
            { id: proxyId, baseCardId: cardId },
            { $set: { displayOrder, updatedAt: new Date().toISOString() } },
          ),
        ),
      );

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

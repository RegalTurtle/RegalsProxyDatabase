import { randomUUID } from "node:crypto";
import { getProxyCollection } from "@/lib/mongodb";

export const runtime = "nodejs";

type ProxyPayload = {
  baseCardId?: string;
  baseCardName?: string;
  creator?: string;
  imageUrl?: string;
  storageKey?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function proxyProjection() {
  return {
    _id: 0,
    id: 1,
    baseCardId: 1,
    baseCardName: 1,
    creator: 1,
    imageUrl: 1,
    storageKey: 1,
    createdAt: 1,
    updatedAt: 1,
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
          { $group: { _id: "$baseCardId", count: { $sum: 1 } } },
        ])
        .toArray();

      return Response.json({
        counts: Object.fromEntries(
          counts.map((item) => {
            const row = item as { _id: string; count: number };
            return [row._id, row.count];
          }),
        ),
      });
    }

    const cardId = url.searchParams.get("cardId")?.trim();
    const filter = cardId ? { baseCardId: cardId } : {};
    const data = await collection.find(filter).project(proxyProjection()).sort({ createdAt: -1 }).toArray();

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
    const proxy = {
      id: randomUUID(),
      baseCardId,
      baseCardName,
      creator: asString(payload.creator) || "Unknown creator",
      imageUrl,
      storageKey: asString(payload.storageKey) || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const collection = await getProxyCollection();
    await collection.insertOne(proxy);

    return Response.json({ data: proxy }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save proxy." }, { status: 500 });
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

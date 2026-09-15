import { getUniversesBeyondSetCollection } from "@/lib/mongodb";
import { putR2Object, slugify } from "@/lib/r2";

export const runtime = "nodejs";

type ScryfallSet = {
  code: string;
  name: string;
  released_at?: string;
  card_count?: number;
  icon_svg_uri?: string;
  scryfall_uri?: string;
};

type UbSetDocument = {
  code: string;
  name: string;
  releasedAt: string;
  cardCount: number;
  iconUrl: string;
  iconStorageKey: string;
  scryfallUri?: string;
  createdAt: string;
  updatedAt: string;
};

function setProjection() {
  return {
    _id: 0,
    code: 1,
    name: 1,
    releasedAt: 1,
    cardCount: 1,
    iconUrl: 1,
    iconStorageKey: 1,
    scryfallUri: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function normalizeSetCode(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/^e:/, "") : "";
}

async function fetchScryfallSet(code: string) {
  const response = await fetch(`https://api.scryfall.com/sets/${encodeURIComponent(code)}`, {
    headers: {
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
    },
  });
  const payload = (await response.json()) as ScryfallSet & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Could not find Scryfall set "${code}".`);
  }

  if (!payload.icon_svg_uri) {
    throw new Error(`Scryfall did not provide a set icon for "${payload.code}".`);
  }

  return payload;
}

async function uploadSetIcon(set: ScryfallSet) {
  const response = await fetch(set.icon_svg_uri ?? "");

  if (!response.ok) {
    throw new Error(`Could not download the set icon for ${set.name}.`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const key = `set-icons/${slugify(set.code) || "set"}.svg`;

  return putR2Object({ body, contentType: "image/svg+xml", key });
}

export async function GET() {
  try {
    const collection = await getUniversesBeyondSetCollection();
    const data = await collection.find({}).project(setProjection()).sort({ releasedAt: -1, name: 1 }).toArray();

    return Response.json({ data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load saved Universes Beyond sets." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { code?: string };
    const code = normalizeSetCode(payload.code);

    if (!code) {
      return Response.json({ error: "Set code is required." }, { status: 400 });
    }

    const collection = await getUniversesBeyondSetCollection();
    const existing = await collection.findOne({ code }, { projection: setProjection() });

    if (existing) {
      return Response.json({ data: existing });
    }

    const scryfallSet = await fetchScryfallSet(code);
    const icon = await uploadSetIcon(scryfallSet);
    const now = new Date().toISOString();
    const document: UbSetDocument = {
      code: scryfallSet.code.toLowerCase(),
      name: scryfallSet.name,
      releasedAt: scryfallSet.released_at ?? "",
      cardCount: scryfallSet.card_count ?? 0,
      iconUrl: icon.url,
      iconStorageKey: icon.key,
      scryfallUri: scryfallSet.scryfall_uri,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(document);

    return Response.json({ data: document }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save Universes Beyond set." },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";

type ScryfallList = {
  data?: ScryfallCard[];
  has_more?: boolean;
  next_page?: string;
  error?: string;
};

type ScryfallCard = {
  oracle_id?: string;
};

async function fetchScryfallList(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
    },
  });
  const payload = (await response.json()) as ScryfallList;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load Universes Beyond cards.");
  }

  return payload;
}

async function fetchUniversesWithinOracleIds() {
  const oracleIds = new Set<string>();
  let nextUrl = "https://api.scryfall.com/cards/search?q=e%3Aslx&unique=cards&order=set";

  for (let page = 0; page < 3 && nextUrl; page += 1) {
    const payload = await fetchScryfallList(nextUrl);

    for (const card of payload.data ?? []) {
      if (card.oracle_id) {
        oracleIds.add(card.oracle_id);
      }
    }

    nextUrl = payload.has_more && payload.next_page ? payload.next_page : "";
  }

  return oracleIds;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const set = url.searchParams.get("set")?.trim().toLowerCase();

    if (!set) {
      return Response.json({ error: "Set code is required." }, { status: 400 });
    }

    const cards: ScryfallCard[] = [];
    let nextUrl = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(
      set,
    )}+is%3Aub+in%3Apaper+not%3Areprint&unique=cards&order=set`;

    for (let page = 0; page < 10 && nextUrl; page += 1) {
      const payload = await fetchScryfallList(nextUrl);

      cards.push(...(payload.data ?? []));
      nextUrl = payload.has_more && payload.next_page ? payload.next_page : "";
    }

    const universesWithinOracleIds = await fetchUniversesWithinOracleIds().catch(() => new Set<string>());
    const data = cards.filter((card) => !card.oracle_id || !universesWithinOracleIds.has(card.oracle_id));

    return Response.json({ data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Universes Beyond cards." },
      { status: 500 },
    );
  }
}

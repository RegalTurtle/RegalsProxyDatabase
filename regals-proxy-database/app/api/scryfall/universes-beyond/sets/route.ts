export const runtime = "nodejs";

type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  released_at?: string;
};

type ScryfallList = {
  data?: ScryfallCard[];
  has_more?: boolean;
  next_page?: string;
  error?: string;
};

type UbSet = {
  code: string;
  name: string;
  cardCount: number;
  releasedAt: string;
};

async function fetchAllUniversesBeyondPrints() {
  const cards: ScryfallCard[] = [];
  let url =
    "https://api.scryfall.com/cards/search?q=is%3Aub+in%3Apaper&unique=prints&order=released&dir=desc";

  for (let page = 0; page < 30 && url; page += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
      },
    });
    const payload = (await response.json()) as ScryfallList;

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load Universes Beyond sets.");
    }

    cards.push(...(payload.data ?? []));
    url = payload.has_more && payload.next_page ? payload.next_page : "";
  }

  return cards;
}

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const cards = (await fetchAllUniversesBeyondPrints()).filter(
      (card) => !card.released_at || card.released_at <= today,
    );
    const sets = new Map<string, UbSet>();

    for (const card of cards) {
      const current = sets.get(card.set);

      if (!current) {
        sets.set(card.set, {
          code: card.set,
          name: card.set_name,
          cardCount: 1,
          releasedAt: card.released_at ?? "",
        });
        continue;
      }

      current.cardCount += 1;
      if ((card.released_at ?? "") > current.releasedAt) {
        current.releasedAt = card.released_at ?? current.releasedAt;
      }
    }

    return Response.json({
      data: [...sets.values()].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Universes Beyond sets." },
      { status: 500 },
    );
  }
}

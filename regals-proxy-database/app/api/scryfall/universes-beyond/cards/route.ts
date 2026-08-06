export const runtime = "nodejs";

type ScryfallList = {
  data?: unknown[];
  has_more?: boolean;
  next_page?: string;
  error?: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const set = url.searchParams.get("set")?.trim().toLowerCase();

    if (!set) {
      return Response.json({ error: "Set code is required." }, { status: 400 });
    }

    const cards: unknown[] = [];
    let nextUrl = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(
      set,
    )}+is%3Aub+in%3Apaper&unique=cards&order=set`;

    for (let page = 0; page < 10 && nextUrl; page += 1) {
      const response = await fetch(nextUrl, {
        headers: {
          Accept: "application/json;q=0.9,*/*;q=0.8",
          "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
        },
      });
      const payload = (await response.json()) as ScryfallList;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load Universes Beyond cards.");
      }

      cards.push(...(payload.data ?? []));
      nextUrl = payload.has_more && payload.next_page ? payload.next_page : "";
    }

    return Response.json({ data: cards });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Universes Beyond cards." },
      { status: 500 },
    );
  }
}

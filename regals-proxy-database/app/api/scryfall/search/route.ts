export const runtime = "nodejs";

const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q) {
    return Response.json({ error: "Missing Scryfall search query." }, { status: 400 });
  }

  const upstream = new URL(SCRYFALL_SEARCH_URL);
  upstream.searchParams.set("q", q);
  upstream.searchParams.set("unique", url.searchParams.get("unique") ?? "cards");
  upstream.searchParams.set("order", url.searchParams.get("order") ?? "name");

  const page = url.searchParams.get("page");
  if (page) {
    upstream.searchParams.set("page", page);
  }

  const response = await fetch(upstream, {
    headers: {
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
    },
  });
  const payload = await response.json();

  return Response.json(payload, {
    status: response.status,
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}

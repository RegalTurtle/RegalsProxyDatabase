export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id) {
    return Response.json({ error: "Missing Scryfall card id." }, { status: 400 });
  }

  const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`, {
    headers: {
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
    },
  });
  const payload = await response.json();

  return Response.json(payload, {
    status: response.status,
    headers: {
      "Cache-Control": "private, max-age=300",
    },
  });
}

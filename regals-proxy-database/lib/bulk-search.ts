export function parseCardList(input: string) {
  const names = input.split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+x?\s+/i, "").trim())
    .filter(Boolean);
  return [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
}

type NamedCard = { id: string; name: string; card_faces?: { name: string }[] };

export async function searchCardList<T extends NamedCard>(input: string, filter: string) {
  const names = parseCardList(input);
  if (!names.length) throw new Error("Paste at least one card name, one per line.");
  if (names.length > 500) throw new Error("Please search up to 500 unique card names at a time.");
  const cards = new Map<string, T>();
  for (let index = 0; index < names.length; index += 20) {
    const terms = names.slice(index, index + 20).map((name) => `!${JSON.stringify(name)}`);
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      if (index || page > 1) await new Promise((resolve) => setTimeout(resolve, 100));
      const params = new URLSearchParams({ q: `(${terms.join(" or ")}) ${filter}`.trim(), unique: "cards", order: "name", page: String(page) });
      const response = await fetch(`/api/scryfall/search?${params}`);
      if (response.status === 404) break;
      const payload = await response.json() as { data?: T[]; has_more?: boolean; error?: string; details?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.details ?? "Bulk search failed. Please try again.");
      for (const card of payload.data ?? []) cards.set(card.id, card);
      hasMore = Boolean(payload.has_more);
      page += 1;
    }
  }
  const data = [...cards.values()];
  const found = new Set(data.flatMap((card) => [card.name, ...(card.card_faces ?? []).map((face) => face.name)]).map((name) => name.toLowerCase()));
  return { data, missing: names.filter((name) => !found.has(name.toLowerCase())), total: names.length };
}

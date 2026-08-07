export const runtime = "nodejs";

type ScryfallSet = {
  code: string;
  name: string;
  released_at?: string;
  card_count: number;
  set_type: string;
  digital: boolean;
  parent_set_code?: string;
};

type ScryfallSetList = {
  data?: ScryfallSet[];
  error?: string;
};

type UbSet = {
  code: string;
  name: string;
  releasedAt: string;
  cardCount: number;
};

const UB_SET_CODES = new Set([
  "40k",
  "acr",
  "bot",
  "fca",
  "fic",
  "fin",
  "ltc",
  "ltr",
  "pip",
  "rex",
  "spm",
  "tla",
  "tle",
  "who",
]);

const UB_PARENT_CODES = new Set([...UB_SET_CODES, "sld"]);

const UB_NAME_PATTERNS = [
  /universes beyond/i,
  /assassin'?s creed/i,
  /avatar: the last airbender/i,
  /doctor who/i,
  /fallout/i,
  /final fantasy/i,
  /fortnite/i,
  /jurassic world/i,
  /lord of the rings|middle-earth/i,
  /marvel|spider-man/i,
  /street fighter/i,
  /stranger things/i,
  /tomb raider/i,
  /transformers/i,
  /walking dead/i,
  /warhammer/i,
];

const FALLBACK_UB_SETS: UbSet[] = [
  { code: "tla", name: "Avatar: The Last Airbender", releasedAt: "2025-11-21", cardCount: 0 },
  { code: "tle", name: "Avatar: The Last Airbender: Eternal-legal", releasedAt: "2025-11-21", cardCount: 0 },
  { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26", cardCount: 0 },
  { code: "fin", name: "Final Fantasy", releasedAt: "2025-06-13", cardCount: 0 },
  { code: "fic", name: "Commander: Final Fantasy", releasedAt: "2025-06-13", cardCount: 0 },
  { code: "fca", name: "Final Fantasy: Through the Ages", releasedAt: "2025-06-13", cardCount: 0 },
  { code: "acr", name: "Assassin's Creed", releasedAt: "2024-07-05", cardCount: 0 },
  { code: "pip", name: "Fallout", releasedAt: "2024-03-08", cardCount: 0 },
  { code: "who", name: "Doctor Who", releasedAt: "2023-10-13", cardCount: 0 },
  { code: "rex", name: "Jurassic World Collection", releasedAt: "2023-11-17", cardCount: 0 },
  { code: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", releasedAt: "2023-06-23", cardCount: 0 },
  { code: "ltc", name: "Commander: The Lord of the Rings: Tales of Middle-earth", releasedAt: "2023-06-23", cardCount: 0 },
  { code: "bot", name: "Transformers", releasedAt: "2022-11-18", cardCount: 0 },
  { code: "40k", name: "Warhammer 40,000 Commander", releasedAt: "2022-10-07", cardCount: 0 },
  { code: "sld", name: "Secret Lair Universes Beyond", releasedAt: "2020-10-04", cardCount: 0 },
];

function isLikelyUniversesBeyondSet(set: ScryfallSet) {
  return (
    UB_SET_CODES.has(set.code) ||
    (set.parent_set_code ? UB_PARENT_CODES.has(set.parent_set_code) : false) ||
    UB_NAME_PATTERNS.some((pattern) => pattern.test(set.name))
  );
}

function toUbSet(set: ScryfallSet): UbSet {
  return {
    code: set.code,
    name: set.name,
    releasedAt: set.released_at ?? "",
    cardCount: set.card_count,
  };
}

function sortSets(sets: UbSet[]) {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();

  return sets
    .filter((set) => !set.releasedAt || set.releasedAt <= today)
    .filter((set) => {
      if (seen.has(set.code)) {
        return false;
      }

      seen.add(set.code);
      return true;
    })
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    const response = await fetch("https://api.scryfall.com/sets", {
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "RegalsProxyDatabase/0.1 personal proxy archive",
      },
    });
    const payload = (await response.json()) as ScryfallSetList;

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load Universes Beyond sets.");
    }

    const dynamicSets = (payload.data ?? []).filter(isLikelyUniversesBeyondSet).map(toUbSet);
    const mergedSets = new Map<string, UbSet>();

    for (const set of [...FALLBACK_UB_SETS, ...dynamicSets]) {
      mergedSets.set(set.code, set);
    }

    return Response.json({ data: sortSets([...mergedSets.values()]) });
  } catch {
    return Response.json({ data: sortSets(FALLBACK_UB_SETS) });
  }
}

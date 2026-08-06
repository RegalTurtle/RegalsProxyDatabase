export const runtime = "nodejs";

type UbSet = {
  code: string;
  name: string;
  releasedAt: string;
};

const UNIVERSes_BEYOND_SETS: UbSet[] = [
  { code: "tla", name: "Avatar: The Last Airbender", releasedAt: "2025-11-21" },
  { code: "tle", name: "Avatar: The Last Airbender: Eternal-legal", releasedAt: "2025-11-21" },
  { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26" },
  { code: "fin", name: "Final Fantasy", releasedAt: "2025-06-13" },
  { code: "fic", name: "Commander: Final Fantasy", releasedAt: "2025-06-13" },
  { code: "fca", name: "Final Fantasy: Through the Ages", releasedAt: "2025-06-13" },
  { code: "acr", name: "Assassin's Creed", releasedAt: "2024-07-05" },
  { code: "pip", name: "Fallout", releasedAt: "2024-03-08" },
  { code: "who", name: "Doctor Who", releasedAt: "2023-10-13" },
  { code: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", releasedAt: "2023-06-23" },
  { code: "ltc", name: "Commander: The Lord of the Rings: Tales of Middle-earth", releasedAt: "2023-06-23" },
  { code: "ltc", name: "The Lord of the Rings Commander", releasedAt: "2023-06-23" },
  { code: "40k", name: "Warhammer 40,000 Commander", releasedAt: "2022-10-07" },
  { code: "bot", name: "Transformers", releasedAt: "2022-11-18" },
  { code: "rex", name: "Jurassic World Collection", releasedAt: "2023-11-17" },
  { code: "sld", name: "Secret Lair Universes Beyond", releasedAt: "2020-10-04" },
];

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const data = UNIVERSes_BEYOND_SETS
    .filter((set) => set.releasedAt <= today)
    .filter((set) => {
      if (seen.has(set.code)) {
        return false;
      }

      seen.add(set.code);
      return true;
    })
    .map((set) => ({ ...set, cardCount: 0 }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name));

  return Response.json({ data });
}

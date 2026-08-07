"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { loadProxySummaries, type LatestProxyByCard } from "@/lib/proxy-summary";

type UbSet = {
  code: string;
  name: string;
  releasedAt: string;
  cardCount: number;
  iconUrl: string;
};

type ScryfallCard = {
  id: string;
  name: string;
  type_line: string;
  collector_number: string;
  set_name: string;
  image_uris?: {
    normal?: string;
  };
  card_faces?: {
    image_uris?: {
      normal?: string;
    };
  }[];
};

function cardImage(card: ScryfallCard) {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? "";
}

function sortSetsByReleaseDate(sets: UbSet[]) {
  return [...sets].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name));
}

export default function UniversesBeyond() {
  const [sets, setSets] = useState<UbSet[]>([]);
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [selectedSet, setSelectedSet] = useState<UbSet | null>(null);
  const [latestProxies, setLatestProxies] = useState<LatestProxyByCard>({});
  const [setCode, setSetCode] = useState("");
  const [status, setStatus] = useState("Loading saved Universes Beyond sets...");
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingSet, setIsAddingSet] = useState(false);

  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const aNumber = Number.parseInt(a.collector_number, 10);
      const bNumber = Number.parseInt(b.collector_number, 10);

      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
        return aNumber - bNumber;
      }

      return a.name.localeCompare(b.name);
    });
  }, [cards]);

  const loadSets = useCallback(async () => {
    setIsLoading(true);
    setStatus("Loading saved Universes Beyond sets...");

    try {
      const response = await fetch("/api/universes-beyond/sets");
      const payload = (await response.json()) as { data?: UbSet[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load saved Universes Beyond sets.");
      }

      const nextSets = sortSetsByReleaseDate(payload.data ?? []);
      setSets(nextSets);
      setStatus(nextSets.length ? "Choose a saved set." : "Add a Universes Beyond set code to begin.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load saved Universes Beyond sets.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function loadCardsForSet(set: UbSet) {
    setSelectedSet(set);
    setCards([]);
    setLatestProxies({});
    setIsLoading(true);
    setStatus(`Loading ${set.name}...`);

    try {
      const response = await fetch(`/api/scryfall/universes-beyond/cards?set=${encodeURIComponent(set.code)}`);
      const payload = (await response.json()) as { data?: ScryfallCard[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? `Could not load ${set.name}.`);
      }

      const nextCards = payload.data ?? [];
      setCards(nextCards);
      setStatus(`${nextCards.length} Universes Beyond card${nextCards.length === 1 ? "" : "s"} in ${set.name}.`);

      if (nextCards.length) {
        const proxyPayload = await loadProxySummaries(nextCards.map((card) => card.id));
        setLatestProxies(proxyPayload.latestProxies ?? {});
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not load ${set.name}.`);
    } finally {
      setIsLoading(false);
    }
  }

  async function addSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = setCode.trim();

    if (!code) {
      return;
    }

    setIsAddingSet(true);
    setStatus(`Adding ${code.toUpperCase()}...`);

    try {
      const response = await fetch("/api/universes-beyond/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as { data?: UbSet; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? `Could not add ${code.toUpperCase()}.`);
      }

      setSetCode("");
      setSets((currentSets) =>
        sortSetsByReleaseDate([...currentSets.filter((set) => set.code !== payload.data?.code), payload.data as UbSet]),
      );
      await loadCardsForSet(payload.data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not add ${code.toUpperCase()}.`);
    } finally {
      setIsAddingSet(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSets();
  }, [loadSets]);

  return (
    <main className="ub-app">
      <div className="scryfall-shell ub-app-shell">
        <header className="scryfall-header">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
            <Link className="brand-mark" href="/">
              <span className="brand-orb">R</span>
              <span>Regal&apos;s Proxy Database</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Link className="nav-link" href="/">
                Search
              </Link>
              <Link className="nav-link" href="/universes-beyond">
                Universes Beyond
              </Link>
            </div>
          </div>
        </header>

        <div className="ub-selected-bar">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            {selectedSet ? <img className="ub-selected-icon" src={selectedSet.iconUrl} alt="" /> : null}
            <div>
              <p className="section-title">{selectedSet ? selectedSet.name : "Universes Beyond"}</p>
              <p className="results-status">
                {selectedSet
                  ? `${selectedSet.code.toUpperCase()} · ${selectedSet.releasedAt || "Unknown date"}`
                  : "Add a set code, then choose a saved set."}
              </p>
            </div>
          </div>
        </div>

        <section className="ub-app-content mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <div className="ub-page-heading">
            <h1 className="detail-title">Universes Beyond Tracker</h1>
            <p className="results-status">{status}</p>
          </div>

          <div className="ub-tracker-layout">
            <aside className="ub-set-rail">
              <form className="ub-add-set-form" onSubmit={addSet}>
                <input
                  className="field"
                  disabled={isAddingSet}
                  onChange={(event) => setSetCode(event.target.value)}
                  placeholder="Set code, e.g. FIN"
                  value={setCode}
                />
                <button className="button-primary" disabled={isAddingSet || !setCode.trim()} type="submit">
                  Add set
                </button>
              </form>

              {sets.map((set) => (
                <button
                  key={set.code}
                  className={selectedSet?.code === set.code ? "ub-set-button active" : "ub-set-button"}
                  disabled={isLoading}
                  onClick={() => void loadCardsForSet(set)}
                >
                  <img className="ub-set-icon" src={set.iconUrl} alt="" />
                  <span>
                    <span className="ub-set-name">{set.name}</span>
                    <span className="ub-set-meta">
                      {set.code.toUpperCase()} · {set.releasedAt || "Unknown date"}
                    </span>
                  </span>
                </button>
              ))}
            </aside>

            <section className="ub-card-panel">
              {selectedSet ? (
                <div className="ub-card-grid">
                  {sortedCards.map((card) => {
                    const proxyImage = latestProxies[card.id]?.imageUrl;
                    const image = proxyImage ?? cardImage(card);

                    return (
                      <Link key={card.id} className="card-tile" href={`/cards/${card.id}`}>
                        <img
                          src={image}
                          alt={card.name}
                          className={`card-image ${proxyImage ? "" : "proxy-missing-image"}`}
                          loading="lazy"
                        />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="detail-panel">
                  <h2 className="section-title">Choose a saved set</h2>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type UbSet = {
  code: string;
  name: string;
  cardCount?: number;
  releasedAt: string;
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

type LatestProxyByCard = Record<string, { imageUrl?: string; createdAt?: string }>;

function cardImage(card: ScryfallCard) {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? "";
}

export default function UniversesBeyond() {
  const [sets, setSets] = useState<UbSet[]>([]);
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [selectedSet, setSelectedSet] = useState<UbSet | null>(null);
  const [latestProxies, setLatestProxies] = useState<LatestProxyByCard>({});
  const [status, setStatus] = useState("Loading Universes Beyond sets...");
  const [isLoading, setIsLoading] = useState(false);

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
    setStatus("Loading Universes Beyond sets...");

    try {
      const response = await fetch("/api/scryfall/universes-beyond/sets");
      const payload = (await response.json()) as { data?: UbSet[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load Universes Beyond sets.");
      }

      const nextSets = payload.data ?? [];
      setSets(nextSets);
      setStatus(nextSets.length ? "Choose a Universes Beyond set." : "No Universes Beyond sets found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load Universes Beyond sets.");
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
        const cardIds = nextCards.map((card) => card.id).join(",");
        const proxyResponse = await fetch(`/api/proxies?cardIds=${encodeURIComponent(cardIds)}`);
        const proxyPayload = (await proxyResponse.json()) as {
          latestProxies?: LatestProxyByCard;
          error?: string;
        };

        if (!proxyResponse.ok) {
          throw new Error(proxyPayload.error ?? "Could not load proxy images.");
        }

        setLatestProxies(proxyPayload.latestProxies ?? {});
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not load ${set.name}.`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSets();
  }, [loadSets]);

  return (
    <main className="min-h-screen">
      <div className="scryfall-shell min-h-screen">
        <header className="scryfall-header">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
            <Link className="brand-mark" href="/">
              <span className="brand-orb">R</span>
              <span>Regal&apos;s Proxy Database</span>
            </Link>
            <Link className="nav-link" href="/">
              Search
            </Link>
          </div>
        </header>

        <section className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <div className="ub-page-heading">
            <h1 className="detail-title">Universes Beyond Tracker</h1>
            <p className="results-status">{status}</p>
          </div>

          <div className="ub-set-grid">
            {sets.map((set) => (
              <button
                key={set.code}
                className={selectedSet?.code === set.code ? "ub-set-button active" : "ub-set-button"}
                disabled={isLoading}
                onClick={() => void loadCardsForSet(set)}
              >
                <span className="ub-set-name">{set.name}</span>
                <span className="ub-set-meta">
                  {set.code.toUpperCase()} · {set.releasedAt || "Unknown date"}
                </span>
              </button>
            ))}
          </div>

          {selectedSet && (
            <div className="mt-6">
              <h2 className="section-title">{selectedSet.name}</h2>
              <div className="card-grid mt-4">
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
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

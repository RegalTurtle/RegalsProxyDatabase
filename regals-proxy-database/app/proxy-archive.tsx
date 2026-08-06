"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ScryfallCard = {
  id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  cmc: number;
  colors?: string[];
  color_identity?: string[];
  set_name: string;
  collector_number: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
    };
  }[];
  prices?: {
    usd?: string | null;
  };
  scryfall_uri: string;
};

type SearchResponse = {
  data: ScryfallCard[];
  total_cards?: number;
  has_more?: boolean;
  next_page?: string;
  warnings?: string[];
};

const DEFAULT_SCRYFALL_FILTER = "in:paper legal:edh";

function cardImage(card: ScryfallCard, size: "small" | "normal" | "large" = "normal") {
  return (
    card.image_uris?.[size] ??
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.[size] ??
    card.card_faces?.[0]?.image_uris?.normal ??
    ""
  );
}

export default function ProxyArchive() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [proxyCounts, setProxyCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("Search Scryfall, then choose a card to add proxy art.");
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showOnlyWithProxies, setShowOnlyWithProxies] = useState(false);
  const [useDefaultFilter, setUseDefaultFilter] = useState(true);

  const visibleCards = useMemo(() => {
    const withFilter = showOnlyWithProxies
      ? cards.filter((card) => (proxyCounts[card.id] ?? 0) > 0)
      : cards;

    return [...withFilter].sort((a, b) => {
      if (sort === "cmc") {
        return a.cmc - b.cmc || a.name.localeCompare(b.name);
      }

      if (sort === "set") {
        return a.set_name.localeCompare(b.set_name) || a.name.localeCompare(b.name);
      }

      if (sort === "proxies") {
        return (proxyCounts[b.id] ?? 0) - (proxyCounts[a.id] ?? 0);
      }

      return a.name.localeCompare(b.name);
    });
  }, [cards, proxyCounts, showOnlyWithProxies, sort]);

  useEffect(() => {
    if (!cards.length) {
      return;
    }

    const controller = new AbortController();
    const cardIds = cards.map((card) => card.id).join(",");

    async function loadCounts() {
      try {
        const response = await fetch(`/api/proxies?cardIds=${encodeURIComponent(cardIds)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          counts?: Record<string, number>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load proxy counts.");
        }

        setProxyCounts(payload.counts ?? {});
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setProxyCounts({});
      }
    }

    void loadCounts();

    return () => controller.abort();
  }, [cards]);

  const runSearch = useCallback(async (searchQuery: string, shouldUseDefaultFilter: boolean) => {
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setStatus("Enter any Scryfall query, like `o:draw commander:esper`.");
      return;
    }

    const scryfallQuery = shouldUseDefaultFilter ? `${trimmed} ${DEFAULT_SCRYFALL_FILTER}` : trimmed;

    setIsSearching(true);
    setStatus("Searching Scryfall...");

    try {
      const params = new URLSearchParams({
        q: scryfallQuery,
        unique: "cards",
        order: "name",
      });
      const response = await fetch(`/api/scryfall/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Scryfall search failed.");
      }

      setCards(payload.data ?? []);
      setStatus(
        `${payload.total_cards ?? payload.data.length} result${
          (payload.total_cards ?? payload.data.length) === 1 ? "" : "s"
        } from Scryfall${payload.has_more ? " - first page shown" : ""}${
          shouldUseDefaultFilter ? ` with ${DEFAULT_SCRYFALL_FILTER}` : ""
        }.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  function searchCards() {
    return runSearch(query, useDefaultFilter);
  }

  return (
    <main className="min-h-screen">
      <div className="scryfall-shell min-h-screen">
        <header className="scryfall-header">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-2 sm:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Link className="brand-mark" href="/">
                <span className="brand-orb">R</span>
                <span>Regal&apos;s Proxy Database</span>
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <a href="https://scryfall.com/docs/syntax" className="nav-link">
                  Syntax
                </a>
              </div>
            </div>

            <form
              className="scryfall-search"
              onSubmit={(event) => {
                event.preventDefault();
                void searchCards();
              }}
            >
              <input
                className="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Search for Magic cards... try: type:legendary o:"draw a card" commander:azorius'
              />
              <button className="primary-button" disabled={isSearching}>
                {isSearching ? "Searching" : "Search"}
              </button>
            </form>
          </div>
        </header>

        <section className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="results-toolbar">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select className="control" value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="name">Name</option>
                  <option value="cmc">Mana Value</option>
                  <option value="set">Set</option>
                  <option value="proxies">Proxy Count</option>
                </select>
                <span className="toolbar-copy">as</span>
                <button
                  className={showOnlyWithProxies ? "toggle active" : "toggle"}
                  onClick={() => setShowOnlyWithProxies((current) => !current)}
                >
                  Has Proxy
                </button>
                <button
                  className={useDefaultFilter ? "toggle active" : "toggle"}
                  onClick={() => {
                    const nextValue = !useDefaultFilter;
                    setUseDefaultFilter(nextValue);
                    void runSearch(query, nextValue);
                  }}
                >
                  Paper EDH
                </button>
                <span className="toolbar-copy">{visibleCards.length} shown</span>
              </div>
              <div className="flex items-center gap-2">
                {(["grid", "list"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={viewMode === mode ? "toggle active" : "toggle"}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <p className="results-status">{status}</p>

            <div
              className={
                viewMode === "list"
                  ? "flex flex-col gap-2"
                  : "card-grid"
              }
            >
              {visibleCards.map((card) => {
                const count = proxyCounts[card.id] ?? 0;
                const image = cardImage(card, "normal");

                if (viewMode === "list") {
                  return (
                    <Link
                      key={card.id}
                      className="list-card"
                      href={`/cards/${card.id}`}
                    >
                      <img src={image} alt="" className="h-16 w-11 rounded object-cover" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-semibold">{card.name}</span>
                        <span className="block truncate text-sm opacity-75">{card.type_line}</span>
                      </span>
                      <span className="badge">{count} proxy</span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={card.id}
                    className="card-tile"
                    href={`/cards/${card.id}`}
                  >
                    <img src={image} alt={card.name} className="card-image" loading="lazy" />
                    <span className="proxy-strip">{count ? `${count} proxy` : "add proxy"}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

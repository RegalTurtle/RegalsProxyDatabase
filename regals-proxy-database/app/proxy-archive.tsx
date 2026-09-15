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

type RecentProxyCard = {
  baseCardId: string;
  baseCardName: string;
  latestProxyAt: string;
};

type LatestProxyByCard = Record<string, { imageUrl?: string; createdAt?: string }>;

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
  const [latestProxies, setLatestProxies] = useState<LatestProxyByCard>({});
  const [status, setStatus] = useState("Search Scryfall, then choose a card to add proxy art.");
  const [isSearching, setIsSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showOnlyWithProxies, setShowOnlyWithProxies] = useState(false);
  const [useDefaultFilter, setUseDefaultFilter] = useState(true);
  const [isShowingRecent, setIsShowingRecent] = useState(true);
  const [imageSource, setImageSource] = useState<"original" | "proxy">("original");

  const visibleCards = useMemo(() => {
    const withFilter = showOnlyWithProxies
      ? cards.filter((card) => (proxyCounts[card.id] ?? 0) > 0)
      : cards;

    if (isShowingRecent) {
      return withFilter;
    }

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
  }, [cards, isShowingRecent, proxyCounts, showOnlyWithProxies, sort]);

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
          latestProxies?: LatestProxyByCard;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load proxy counts.");
        }

        setProxyCounts(payload.counts ?? {});
        setLatestProxies(payload.latestProxies ?? {});
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setProxyCounts({});
        setLatestProxies({});
      }
    }

    void loadCounts();

    return () => controller.abort();
  }, [cards]);

  const loadRecentCards = useCallback(async () => {
    setIsSearching(true);
    setIsShowingRecent(true);
    setStatus("Loading recent proxy cards...");

    try {
      const response = await fetch("/api/proxies?recentCards=20");
      const payload = (await response.json()) as {
        data?: RecentProxyCard[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load recent proxy cards.");
      }

      const recentCards = payload.data ?? [];
      const hydratedCards = await Promise.all(
        recentCards.map(async (proxyCard) => {
          const cardResponse = await fetch(`/api/scryfall/cards/${proxyCard.baseCardId}`);
          const cardPayload = (await cardResponse.json()) as ScryfallCard & { error?: string };

          if (!cardResponse.ok) {
            throw new Error(cardPayload.error ?? `Could not load ${proxyCard.baseCardName}.`);
          }

          return cardPayload;
        }),
      );

      setCards(hydratedCards);
      setStatus(
        hydratedCards.length
          ? `Showing the ${hydratedCards.length} most recent card${hydratedCards.length === 1 ? "" : "s"} with proxies.`
          : "No proxies have been added yet. Search Scryfall to add your first one.",
      );
    } catch (error) {
      setCards([]);
      setStatus(error instanceof Error ? error.message : "Could not load recent proxy cards.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const runSearch = useCallback(async (searchQuery: string, shouldUseDefaultFilter: boolean) => {
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setSubmittedQuery("");
      await loadRecentCards();
      return;
    }

    setIsShowingRecent(false);
    setSubmittedQuery(trimmed);
    setSearchFailed(false);
    setCards([]);
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
      const payload = (await response.json()) as SearchResponse & { error?: string; details?: string };

      if (response.status === 404) {
        setCards([]);
        setStatus("0 results from Scryfall.");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? payload.details ?? "Scryfall search failed.");
      }

      setCards(payload.data ?? []);
      setStatus(
        `${payload.total_cards ?? payload.data?.length ?? 0} result${
          (payload.total_cards ?? payload.data?.length ?? 0) === 1 ? "" : "s"
        } from Scryfall${payload.has_more ? " - first page shown" : ""}${
          shouldUseDefaultFilter ? ` with ${DEFAULT_SCRYFALL_FILTER}` : ""
        }.`,
      );
    } catch (error) {
      setSearchFailed(true);
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSearching(false);
    }
  }, [loadRecentCards]);

  function searchCards() {
    return runSearch(query, useDefaultFilter);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecentCards();
  }, [loadRecentCards]);

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
                  aria-pressed={showOnlyWithProxies}
                  onClick={() => setShowOnlyWithProxies((current) => !current)}
                >
                  Has Proxy
                </button>
                <button
                  className={useDefaultFilter ? "toggle active" : "toggle"}
                  aria-pressed={useDefaultFilter}
                  disabled={isSearching}
                  onClick={() => {
                    const nextValue = !useDefaultFilter;
                    setUseDefaultFilter(nextValue);
                    if (submittedQuery || query.trim()) {
                      void runSearch(submittedQuery || query, nextValue);
                    }
                  }}
                >
                  Paper + EDH
                </button>
                {(["original", "proxy"] as const).map((source) => (
                  <button
                    key={source}
                    className={imageSource === source ? "toggle active" : "toggle"}
                    onClick={() => setImageSource(source)}
                  >
                    {source === "original" ? "Original" : "Proxy"}
                  </button>
                ))}
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

            {!isShowingRecent && !isSearching && !searchFailed && visibleCards.length === 0 && (
              <div className="detail-panel py-10 text-center" role="status">
                <h1 className="detail-title">No results found</h1>
                <p className="mt-3 text-sm opacity-75">
                  No cards match “{submittedQuery}” with your current filters. Try changing your search or turning off a filter.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {useDefaultFilter && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setUseDefaultFilter(false);
                        void runSearch(submittedQuery, false);
                      }}
                    >
                      Turn off Paper + EDH and search again
                    </button>
                  )}
                  {showOnlyWithProxies && (
                    <button type="button" className="secondary-button" onClick={() => setShowOnlyWithProxies(false)}>
                      Turn off Has Proxy
                    </button>
                  )}
                </div>
              </div>
            )}

            <div
              className={
                viewMode === "list"
                  ? "flex flex-col gap-2"
                  : "card-grid"
              }
            >
              {visibleCards.map((card) => {
                const count = proxyCounts[card.id] ?? 0;
                const proxyImage = latestProxies[card.id]?.imageUrl;
                const image = imageSource === "proxy" && proxyImage ? proxyImage : cardImage(card, "normal");
                const isMissingProxyImage = imageSource === "proxy" && !proxyImage;

                if (viewMode === "list") {
                  return (
                    <Link
                      key={card.id}
                      className="list-card"
                      href={`/cards/${card.id}`}
                    >
                      <img
                        src={image}
                        alt=""
                        className={`h-16 w-11 rounded object-cover ${isMissingProxyImage ? "proxy-missing-image" : ""}`}
                      />
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
                    <img
                      src={image}
                      alt={card.name}
                      className={`card-image ${isMissingProxyImage ? "proxy-missing-image" : ""}`}
                      loading="lazy"
                    />
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

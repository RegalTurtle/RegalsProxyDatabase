"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadProxySummaries, type LatestProxyByCard } from "@/lib/proxy-summary";

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

type ProxySearchMatch = {
  baseCardId: string;
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

function parseProxySearch(query: string) {
  const matches = [...query.matchAll(/\b(pc|proxycreator|pa|proxyartist):(?:"([^"]+)"|(\S+))/gi)];
  let creator = "";
  let artist = "";

  for (const match of matches) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (match[1].toLowerCase() === "pc" || match[1].toLowerCase() === "proxycreator") {
      creator = value;
    } else {
      artist = value;
    }
  }

  return {
    creator,
    artist,
    remainingQuery: query.replace(/\b(pc|proxycreator|pa|proxyartist):(?:"[^"]+"|\S+)/gi, "").replace(/\s+/g, " ").trim(),
  };
}

export default function ProxyArchive({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("name");
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [proxyCounts, setProxyCounts] = useState<Record<string, number>>({});
  const [latestProxies, setLatestProxies] = useState<LatestProxyByCard>({});
  const [status, setStatus] = useState("Search Scryfall, then choose a card to add proxy art.");
  const [isSearching, setIsSearching] = useState(false);
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
    const cardIds = cards.map((card) => card.id);

    async function loadCounts() {
      try {
        const payload = await loadProxySummaries(cardIds, controller.signal);

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
      await loadRecentCards();
      return;
    }

    const proxySearch = parseProxySearch(trimmed);
    const hasProxySearch = Boolean(proxySearch.creator || proxySearch.artist);
    const cardQuery = proxySearch.remainingQuery;

    setIsShowingRecent(false);

    setIsSearching(true);
    setStatus("Searching Scryfall...");

    try {
      let matchingCardIds: Set<string> | undefined;

      if (hasProxySearch) {
        const proxyParams = new URLSearchParams();
        if (proxySearch.creator) {
          proxyParams.set("proxyCreator", proxySearch.creator);
        }
        if (proxySearch.artist) {
          proxyParams.set("proxyArtist", proxySearch.artist);
        }

        const proxyResponse = await fetch(`/api/proxies?${proxyParams.toString()}`);
        const proxyPayload = (await proxyResponse.json()) as { data?: ProxySearchMatch[]; error?: string };

        if (!proxyResponse.ok) {
          throw new Error(proxyPayload.error ?? "Could not search proxy credits.");
        }

        matchingCardIds = new Set((proxyPayload.data ?? []).map((proxy) => proxy.baseCardId));
      }

      if (!cardQuery && matchingCardIds) {
        const hydratedCards = await Promise.all(
          [...matchingCardIds].map(async (proxyCardId) => {
            const cardResponse = await fetch(`/api/scryfall/cards/${proxyCardId}`);
            const cardPayload = (await cardResponse.json()) as ScryfallCard & { error?: string };

            if (!cardResponse.ok) {
              throw new Error(cardPayload.error ?? "Could not load a matching card.");
            }

            return cardPayload;
          }),
        );

        setCards(hydratedCards);
        setStatus(`${hydratedCards.length} card${hydratedCards.length === 1 ? "" : "s"} with matching proxy credits.`);
        return;
      }

      const params = new URLSearchParams({
        q: shouldUseDefaultFilter ? `${cardQuery} ${DEFAULT_SCRYFALL_FILTER}` : cardQuery,
        unique: "cards",
        order: "name",
      });
      const response = await fetch(`/api/scryfall/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Scryfall search failed.");
      }

      const filteredCards = matchingCardIds
        ? (payload.data ?? []).filter((card) => matchingCardIds?.has(card.id))
        : payload.data ?? [];

      if (filteredCards.length === 1 && filteredCards[0]?.id) {
        router.push(`/cards/${filteredCards[0].id}`);
        return;
      }

      setCards(filteredCards);
      setStatus(
        `${filteredCards.length} result${filteredCards.length === 1 ? "" : "s"}${
          hasProxySearch ? " matching proxy credits" : " from Scryfall"
        }${payload.has_more ? " - first page shown" : ""}${
          shouldUseDefaultFilter && cardQuery ? ` with ${DEFAULT_SCRYFALL_FILTER}` : ""
        }.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSearching(false);
    }
  }, [loadRecentCards, router]);

  function searchCards() {
    return runSearch(query, useDefaultFilter);
  }

  useEffect(() => {
    if (initialQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runSearch(initialQuery, useDefaultFilter);
      return;
    }

    void loadRecentCards();
  }, [initialQuery, loadRecentCards, runSearch, useDefaultFilter]);

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
                <Link href="/universes-beyond" className="nav-link">
                  Universes Beyond
                </Link>
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
                    if (query.trim()) {
                      void runSearch(query, nextValue);
                    }
                  }}
                >
                  Paper EDH
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

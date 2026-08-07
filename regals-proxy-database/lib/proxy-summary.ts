export type LatestProxyByCard = Record<string, { imageUrl?: string; createdAt?: string }>;

type ProxySummaryPayload = {
  counts?: Record<string, number>;
  latestProxies?: LatestProxyByCard;
  error?: string;
};

const PROXY_SUMMARY_BATCH_SIZE = 50;

export async function loadProxySummaries(cardIds: string[], signal?: AbortSignal) {
  const counts: Record<string, number> = {};
  const latestProxies: LatestProxyByCard = {};

  for (let index = 0; index < cardIds.length; index += PROXY_SUMMARY_BATCH_SIZE) {
    const batch = cardIds.slice(index, index + PROXY_SUMMARY_BATCH_SIZE);
    const response = await fetch(`/api/proxies?cardIds=${encodeURIComponent(batch.join(","))}`, { signal });
    const payload = (await response.json()) as ProxySummaryPayload;

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load proxy summaries.");
    }

    Object.assign(counts, payload.counts ?? {});
    Object.assign(latestProxies, payload.latestProxies ?? {});
  }

  return { counts, latestProxies };
}

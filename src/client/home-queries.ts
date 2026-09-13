import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { HomeStatus, Snapshot, TimelineEvent } from "../lib/types";

export const refreshInterval = 60_000;
const loadingRefreshInterval = 2_000;
const historyFreshTime = 10 * 60_000;

// Startup responses are provisional. Follow connection/history loading until
// usable data arrives, then return to the journal's normal slow refresh rate.
function snapshotRefreshInterval(snapshot?: Pick<Snapshot, "connection">) {
  return snapshot?.connection.mode === "reconnecting" ||
    snapshot?.connection.history === "loading"
    ? loadingRefreshInterval
    : refreshInterval;
}

export function createHomeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: refreshInterval,
        gcTime: historyFreshTime,
        retry: 1,
        refetchIntervalInBackground: false,
      },
    },
  });
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error("The local server could not load this data.");
  return response.json();
}

export function statusOptions() {
  return queryOptions({
    queryKey: ["home-status"],
    queryFn: ({ signal }) => readJson<HomeStatus>("/api/status", signal),
    staleTime: (query) => snapshotRefreshInterval(query.state.data),
    refetchInterval: (query) => snapshotRefreshInterval(query.state.data),
  });
}

export function timelineOptions(session: string, url: string, past: boolean) {
  return queryOptions({
    queryKey: ["timeline", session, url],
    queryFn: ({ signal }) => readJson<Snapshot>(url, signal),
    staleTime: (query) =>
      past && query.state.data?.connection.history === "ready"
        ? historyFreshTime
        : snapshotRefreshInterval(query.state.data),
    refetchInterval: (query) =>
      past && query.state.data?.connection.history === "ready"
        ? false
        : snapshotRefreshInterval(query.state.data),
  });
}

export function entityHistoryOptions(
  session: string,
  id: string,
  range: { start: string; end: string },
) {
  const params = new URLSearchParams(range);
  return queryOptions({
    queryKey: ["entity-history", session, id, range.start, range.end],
    queryFn: ({ signal }) =>
      readJson<{ events: TimelineEvent[] }>(
        `/api/entities/${encodeURIComponent(id)}?${params}`,
        signal,
      ),
    staleTime:
      Date.parse(range.end) < Date.now() ? historyFreshTime : refreshInterval,
  });
}

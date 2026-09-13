"use client";
import { TimelineFilters } from "./timeline/timeline-filters";
import { HomeSummary } from "./timeline/home-summary";
import { TimelineSearch } from "./timeline/timeline-search";
import { TimelineSettings } from "./timeline/timeline-settings";
import { labels } from "./timeline/primitives";
import { timelineFormat } from "./timeline/format";
import { ConnectHomeDialog } from "./timeline/connect-home-dialog";
import { EventInspector } from "./timeline/event-inspector";
import { TimelineList } from "./timeline/timeline-list";
import { createTimelineFeed } from "@/client/timeline-feed";
import {
  createHomeQueryClient,
  statusOptions,
  timelineOptions,
} from "@/client/home-queries";
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { selectTimeline, countNewVisibleEvents } from "@/lib/query";
import { useEffect, useMemo, useRef, useState } from "react";

import { motion, MotionConfig } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  House,
  LockKeyhole,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Wifi,
} from "lucide-react";

import { createDemo } from "@/lib/demo";
import { normalize, observationId } from "@/lib/engine";
import { type Category, type Snapshot, type TimelineEvent } from "@/lib/types";
import { rangeForPeriod } from "@/lib/time";
export default function HomeTimeline() {
  const [client] = useState(createHomeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <HomeTimelineScreen />
    </QueryClientProvider>
  );
}

function HomeTimelineScreen() {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const status = useQuery({ ...statusOptions(), enabled: visible });
  const [data, setData] = useState<Snapshot | null>(null),
    [period, setPeriod] = useState("Live"),
    [search, setSearch] = useState(""),
    [room, setRoom] = useState(""),
    [person, setPerson] = useState(""),
    [category, setCategory] = useState("");
  const [customStart, setCustomStart] = useState(""),
    [customEnd, setCustomEnd] = useState("");
  const [connectOpen, setConnectOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [debug, setDebug] = useState(false),
    [theme, setTheme] = useState("system");
  const [excluded, setExcluded] = useState<string[]>([]),
    [domains, setDomains] = useState<string[]>([]),
    [pending, setPending] = useState(0),
    [limit, setLimit] = useState(80),
    [clock, setClock] = useState(new Date(0));
  const pendingData = useRef<Snapshot | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const periodRef = useRef(period);
  periodRef.current = period;
  const homeTimezone =
    status.data?.connection.mode === "demo"
      ? data?.connection.timezone
      : status.data?.connection.timezone;
  const homeDay = clock.getTime()
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: homeTimezone || "UTC",
      }).format(clock)
    : "";
  const rollingMinute =
    period === "Last 24 hours" ? Math.floor(clock.getTime() / 60000) : 0;
  const range = useMemo(
    () => rangeForPeriod(period, homeTimezone, customStart, customEnd),
    [period, homeTimezone, customStart, customEnd, homeDay, rollingMinute],
  );
  const filtersQuery = new URLSearchParams({
    q: search,
    room,
    person,
    category,
    debug: String(debug),
  }).toString();
  const filtersRef = useRef(filtersQuery);
  const [debouncedFilters, setDebouncedFilters] = useState(filtersQuery);
  filtersRef.current = debouncedFilters;
  const session = status.data?.connection.sessionId || "";
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const viewRef = useRef({
    ...range,
    search,
    room,
    person,
    category,
    debug,
    excluded,
    domains,
  });
  viewRef.current = {
    ...range,
    search,
    room,
    person,
    category,
    debug,
    excluded,
    domains,
  };
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const url = `/api/timeline?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}&${debouncedFilters}`;
  const past =
    Date.parse(range.end) <=
    Date.parse(rangeForPeriod("Live", homeTimezone).start);
  const pastRef = useRef(past);
  pastRef.current = past;
  const timeline = useQuery({
    ...timelineOptions(session, url, past),
    enabled:
      visible && !!session && status.data?.connection.mode === "connected",
  });
  const busy = timeline.isFetching;
  const feed = useRef<ReturnType<typeof createTimelineFeed> | null>(null);
  if (!feed.current)
    feed.current = createTimelineFeed({
      read: () => ({
        url: `/api/timeline?start=${encodeURIComponent(rangeRef.current.start)}&end=${encodeURIComponent(rangeRef.current.end)}&${filtersRef.current}`,
        view: viewRef.current,
        snapshot: dataRef.current,
        reading: window.scrollY > 280 && periodRef.current === "Live",
      }),
      fetch: (url) =>
        queryClient.fetchQuery(
          timelineOptions(sessionRef.current, url, pastRef.current),
        ),
      commit: ({ snapshot, pending: next, count }) => {
        dataRef.current = snapshot;
        setData(snapshot);
        pendingData.current = next;
        setPending(count);
      },
    });
  useEffect(() => {
    setData(createDemo());
    setClock(new Date());
    try {
      setTheme(localStorage.getItem("ht-theme") || "system");
      setExcluded(JSON.parse(localStorage.getItem("ht-excluded") || "[]"));
      setDomains(JSON.parse(localStorage.getItem("ht-domains") || "[]"));
    } catch {}
    const visibility = () => setVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      feed.current?.cancel();
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    feed.current?.cancel();
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] !== "home-status" && query.queryKey[1] !== session,
    });
    pendingData.current = null;
    setPending(0);
    setSelected(null);
    dataRef.current = null;
    setData(null);
  }, [session, queryClient]);
  useEffect(() => {
    if (!status.data) return;
    const next = status.data;
    setData((current) => {
      const snapshot =
        next.connection.mode === "demo"
          ? current?.connection.mode === "demo"
            ? current
            : createDemo()
          : { ...(current || { events: [] }), ...next };
      dataRef.current = snapshot;
      return snapshot;
    });
  }, [status.data, status.dataUpdatedAt]);
  useEffect(() => {
    if (timeline.data && timeline.data.connection.sessionId === session)
      feed.current?.receive(url, {
        ...timeline.data,
        ...(status.dataUpdatedAt > timeline.dataUpdatedAt ? status.data : {}),
      });
  }, [
    timeline.data,
    timeline.dataUpdatedAt,
    status.data,
    status.dataUpdatedAt,
    session,
    url,
    period,
    excluded,
    domains,
  ]);
  useEffect(() => {
    setLimit(80);
  }, [range.start, range.end]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filtersQuery), 180);
    return () => clearTimeout(timer);
  }, [filtersQuery]);
  useEffect(() => {
    if (!status.isError && !timeline.isError) return;
    setData((current) =>
      current && current.connection.mode !== "demo"
        ? {
            ...current,
            connection: {
              ...current.connection,
              mode: "reconnecting",
              message: "The local server is unavailable. Retrying…",
            },
          }
        : current,
    );
  }, [status.isError, timeline.isError]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const changeTheme = (value: string) => {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    localStorage.setItem("ht-theme", value);
  };
  const updateExclusions = (values: string[], domain = false) => {
    if (domain) setDomains(values);
    else setExcluded(values);
    localStorage.setItem(
      domain ? "ht-domains" : "ht-excluded",
      JSON.stringify(values),
    );
  };
  const inspect = (event: TimelineEvent) => {
    setSelected(event);
  };
  const showPending = () => {
    if (pendingData.current) {
      const next = {
        ...pendingData.current,
        connection: data!.connection,
        states: data!.states,
        metadata: data!.metadata,
      };
      dataRef.current = next;
      setData(next);
    }
    pendingData.current = null;
    setPending(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const simulate = () => {
    if (!data) return;
    const baseData = pendingData.current || data;
    const id = "binary_sensor.hall_motion";
    const timestamp = new Date().toISOString();
    const base = data.states.find((s) => s.entity_id === id)!;
    const state = {
      ...base,
      state: "on",
      last_updated: timestamp,
      last_changed: timestamp,
    };
    const e = normalize(
      {
        id: observationId(state),
        entityId: id,
        timestamp,
        previous: { ...base, state: "off" },
        current: state,
        origin: "demo",
        type: "state",
      },
      data.metadata,
    );
    const next = { ...baseData, events: [...baseData.events, e] };
    if (window.scrollY > 280) {
      const count = countNewVisibleEvents(
        data.events,
        next.events,
        viewRef.current,
      );
      pendingData.current = count ? next : null;
      setPending(count);
    } else setData(next);
  };
  const simulateRef = useRef(simulate);
  simulateRef.current = simulate;
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        dataRef.current?.connection.mode === "demo" &&
        periodRef.current === "Live" &&
        document.visibilityState === "visible"
      )
        simulateRef.current();
    }, 45000);
    return () => clearInterval(timer);
  }, []);
  const disconnect = async () => {
    const res = await fetch("/api/connection", { method: "DELETE" });
    if (res.ok) {
      feed.current?.cancel();
      queryClient.clear();
      setData(createDemo());
      dataRef.current = null;
      setSelected(null);
      setSettingsOpen(false);
      pendingData.current = null;
      setPending(0);
      await status.refetch();
    }
  };
  const allEvents = data?.events || [];
  const { items, matchingIds } = useMemo(
    () =>
      selectTimeline(allEvents, {
        ...range,
        debug,
        excluded,
        domains,
        room,
        person,
        category,
        search,
      }),
    [
      allEvents,
      range,
      debug,
      excluded,
      domains,
      room,
      person,
      category,
      search,
    ],
  );
  const rooms = Array.from(
    new Map(
      Object.values(data?.metadata || {})
        .filter((x) => x.room)
        .map((x) => [x.room!.id, x.room!]),
    ).values(),
  );
  const people = (data?.states || []).filter((s) =>
    s.entity_id.startsWith("person."),
  );
  const activeFilters = [
    room && {
      type: "room",
      name: rooms.find((r) => r.id === room)?.name || room,
      clear: () => setRoom(""),
    },
    person && {
      type: "person",
      name:
        people.find((p) => p.entity_id === person)?.attributes.friendly_name ||
        person,
      clear: () => setPerson(""),
    },
    category && {
      type: "category",
      name: labels[category as Category],
      clear: () => setCategory(""),
    },
    search && {
      type: "search",
      name: `“${search}”`,
      clear: () => setSearch(""),
    },
  ].filter(Boolean) as { type: string; name: string; clear: () => void }[];
  const { time, day } = timelineFormat(data?.connection.timezone);
  const demo = data?.connection.mode === "demo";
  const waitingForInitial =
    !items.length &&
    !demo &&
    (status.isPending ||
      status.data?.connection.mode === "reconnecting" ||
      timeline.isPending ||
      timeline.data?.connection.history === "loading");
  const needsConnection = demo || data?.connection.mode === "error";
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="app-header">
          <a className="brand" href="/" aria-label="Home Timeline">
            <span className="brand-mark">
              <House size={18} strokeWidth={1.7} />
            </span>
            <span>
              home<span className="brand-light">timeline</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <button
              className={period === "Live" ? "active" : ""}
              onClick={() => setPeriod("Live")}
            >
              <span className="live-dot" />
              Live
            </button>
            <button
              className={period !== "Live" ? "active" : ""}
              onClick={() => setPeriod("Today")}
            >
              <Clock3 size={14} />
              History
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="header-search"
              aria-label="Search your home"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Search your home</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button settings-trigger"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        <main>
          <section className="intro">
            <div className="intro-top">
              <span className="eyebrow">
                <span className="live-dot" />
                {demo
                  ? "DEMO HOME"
                  : data?.connection.mode === "connected"
                    ? "CONNECTED TO HOME"
                    : data?.connection.mode?.toUpperCase() || "WELCOME HOME"}
              </span>
              <span className="date-label">
                {data
                  ? clock.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      timeZone: data?.connection.timezone,
                    })
                  : "A new chapter awaits"}
              </span>
            </div>
            <div className="intro-title">
              <div>
                <h1>
                  Your home, <span>in moments.</span>
                </h1>
                <p>A little context for everything that happens.</p>
              </div>
              <div className="home-symbol">
                <House size={40} strokeWidth={0.85} />
                <span />
              </div>
            </div>
          </section>
          <HomeSummary
            data={data}
            clock={clock}
            person={person}
            onPerson={setPerson}
          />
          <section className="timeline-section">
            <TimelineFilters
              value={{
                period,
                customStart,
                customEnd,
                room,
                person,
                category,
                search,
              }}
              onChange={(key, value) =>
                ({
                  period: setPeriod,
                  customStart: setCustomStart,
                  customEnd: setCustomEnd,
                  room: setRoom,
                  person: setPerson,
                  category: setCategory,
                  search: setSearch,
                })[key](value)
              }
              rooms={rooms}
              people={people}
              activeFilters={activeFilters}
              count={items.length}
            />
            <div className="coverage-line">
              <span>
                {data?.connection.mode === "reconnecting" && !data.states.length
                  ? "Connecting to your home…"
                  : data?.nextCursor
                    ? "More activity is available · load more below"
                    : busy || data?.connection.history === "loading"
                      ? "Gathering your home’s history…"
                      : demo
                        ? "A glimpse into a day at home"
                        : data?.connection.history === "partial"
                          ? "Some history could not be loaded"
                          : data?.connection.history === "unavailable"
                            ? "History unavailable · live activity will still appear"
                            : `${day(range.start)} · ${time(range.start)}–${period === "Live" || period === "Today" ? time(clock.toISOString()) : time(range.end)}`}
              </span>
              <span className="live-status">
                {period === "Live" && (
                  <>
                    <span className="live-dot" />
                    {demo
                      ? "SIMULATED LIVE"
                      : data?.connection.mode === "connected"
                        ? "UPDATES EVERY MINUTE"
                        : "OFFLINE"}
                  </>
                )}
                <button
                  className="icon-button"
                  aria-label="Refresh home activity"
                  disabled={busy || status.isFetching}
                  onClick={() => {
                    void status.refetch();
                    if (!demo) void timeline.refetch();
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </span>
            </div>
            {data?.connection.message && (
              <div className="connection-notice">
                <Wifi size={15} />
                {data.connection.message}
                {data.connection.lastUpdate && (
                  <span> Last update {time(data.connection.lastUpdate)}</span>
                )}
              </div>
            )}
            {pending > 0 && (
              <button className="new-events" onClick={showPending}>
                <ArrowDown size={14} />
                {pending} new {pending === 1 ? "event" : "events"} · Back to now
              </button>
            )}
            <div className="timeline">
              {!data || waitingForInitial ? (
                <div
                  className="skeleton"
                  role="status"
                  aria-label="Loading home activity"
                >
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} />
                  ))}
                </div>
              ) : items.length ? (
                <TimelineList
                  items={items}
                  limit={limit}
                  matchingIds={matchingIds}
                  filtered={activeFilters.length > 0}
                  debug={debug}
                  timezone={data?.connection.timezone}
                  onInspect={inspect}
                />
              ) : (
                <div className="empty-state">
                  <Moon size={30} strokeWidth={1} />
                  <h3>
                    {activeFilters.length
                      ? "No matching moments"
                      : "A quiet chapter"}
                  </h3>
                  <p>
                    {activeFilters.length
                      ? "Try another room, category, or a wider time range."
                      : demo
                        ? "There are no demo events in this period. Try Today."
                        : "No activity was returned for this period. Recording coverage may vary."}
                  </p>
                  {activeFilters.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setRoom("");
                        setCategory("");
                        setPerson("");
                        setSearch("");
                      }}
                    >
                      Clear filters <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {items.length > limit && (
              <button
                className="load-more"
                onClick={() => setLimit((l) => l + 80)}
              >
                Earlier moments
                <ChevronDown size={15} />
              </button>
            )}
            {data?.nextCursor && (
              <button
                className="load-more"
                onClick={() => void feed.current!.loadMore()}
              >
                Load more history
                <ChevronDown size={15} />
              </button>
            )}
            <div className="timeline-end">
              <span />
              <House size={14} />
              <span />
              <p>Every little moment makes a home.</p>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              <LockKeyhole size={12} />
              Your home’s story stays at home.
            </span>
            <button
              onClick={() => setDebug((v) => !v)}
              className={debug ? "debug-on" : ""}
            >
              <Code2 size={14} />
              {debug ? "Debug mode on" : "Peek under the hood"}
            </button>
          </footer>
        </main>
        {needsConnection && (
          <div className="demo-dock">
            <span className="demo-spark">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>
                {demo ? "A home to explore." : "Let’s reconnect."}
              </strong>
              <span>
                {demo
                  ? "You’re looking at a thoughtfully imagined day."
                  : "Check your Home Assistant connection."}
              </span>
            </div>
            <button
              className="demo-simulate"
              disabled={!demo}
              onClick={simulate}
              title="Simulate a live motion event"
            >
              <Plus size={15} />
              <span>New moment</span>
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setConnectOpen(true);
              }}
            >
              Connect your home
              <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        <TimelineSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          search={search}
          onSearch={setSearch}
          data={data}
          range={range}
          period={period}
          onInspect={inspect}
        />
        {connectOpen && (
          <ConnectHomeDialog
            open
            onOpenChange={setConnectOpen}
            onConnected={async (snapshot) => {
              feed.current?.cancel();
              queryClient.clear();
              setData(snapshot);
              dataRef.current = snapshot;
              pendingData.current = null;
              setPending(0);
              await status.refetch();
            }}
          />
        )}
        <TimelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          data={data}
          preferences={{
            theme,
            debug,
            excluded,
            domains,
            changeTheme,
            setDebug,
            updateExclusions,
          }}
          onConnect={() => setConnectOpen(true)}
          disconnect={disconnect}
        />
        {selected && (
          <EventInspector
            key={selected.id}
            event={selected}
            data={data}
            range={range}
            onClose={() => setSelected(null)}
            onExclude={(id) =>
              updateExclusions([...new Set([...excluded, id])])
            }
          />
        )}
      </div>
    </MotionConfig>
  );
}

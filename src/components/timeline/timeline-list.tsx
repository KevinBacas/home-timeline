"use client";

import { useState } from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  House,
  Lightbulb,
  Play,
} from "lucide-react";

import { type TimelineEvent, type TimelineItem } from "@/lib/types";

import { Icon } from "./primitives";
import { timelineFormat } from "./format";
export function TimelineList({
  items,
  limit,
  matchingIds,
  filtered,
  debug,
  timezone,
  onInspect: inspect,
}: {
  items: TimelineItem[];
  limit: number;
  matchingIds: Set<string>;
  filtered: boolean;
  debug: boolean;
  timezone?: string;
  onInspect: (event: TimelineEvent) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { time, day } = timelineFormat(timezone);
  const matches = (event: TimelineEvent) => matchingIds.has(event.id);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  function eventRow(e: TimelineEvent, child = false) {
    return (
      <button
        className={`event-content ${child ? "child-event" : ""}`}
        onClick={() => inspect(e)}
      >
        <span className={`event-icon ${e.category}`}>
          <Icon category={e.category} />
        </span>
        <span className="event-copy">
          <span className="event-title">
            {e.title}
            {e.importance === "critical" && (
              <span className="critical">Alert</span>
            )}
          </span>
          {e.description && (
            <span className="event-description">{e.description}</span>
          )}
          {debug && (
            <code className="inline-debug">
              {e.entityId}
              {e.suppressed ? ` · ${e.suppressed}` : ""}
            </code>
          )}
        </span>
        <span className="event-meta">
          {child ? time(e.timestamp) : e.room?.name}
        </span>
        <ChevronRight size={15} className="row-arrow" />
      </button>
    );
  }
  function renderItem(item: TimelineItem, index: number) {
    const previous = items[index - 1];
    const dateBreak =
      previous && day(previous.timestamp) !== day(item.timestamp);
    return (
      <div key={item.id}>
        {dateBreak && <div className="day-divider">{day(item.timestamp)}</div>}
        <motion.div
          layout="position"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26 }}
          className={`timeline-row ${item.type === "story" ? "story-row" : ""}`}
        >
          <div className="time-gutter">{time(item.timestamp)}</div>
          <span
            className={`timeline-node ${item.type === "story" ? "story-node" : ""}`}
          />
          <div className="row-body">
            {item.type === "event" ? (
              eventRow(item.event)
            ) : (
              <div className={`story ${item.story.rule}`}>
                <button
                  className="story-heading"
                  onClick={() => toggle(item.id)}
                  aria-expanded={expanded.has(item.id)}
                >
                  <span
                    className={`story-icon ${item.story.rule === "movie" ? "media" : item.story.rule === "lighting" ? "lighting" : "presence"}`}
                  >
                    {item.story.rule === "movie" ? (
                      <Play size={22} />
                    ) : item.story.rule === "lighting" ? (
                      <Lightbulb size={22} />
                    ) : item.story.rule === "arrival" ? (
                      <House size={23} />
                    ) : (
                      <Activity size={23} />
                    )}
                  </span>
                  <span className="story-copy">
                    <span className="eyebrow">
                      {item.story.rule === "movie"
                        ? "AN EVENING AT HOME"
                        : item.story.rule === "arrival"
                          ? "A WELCOME HOME"
                          : item.story.rule === "lighting"
                            ? "LIGHTS TOGETHER"
                            : "LITTLE MOMENTS"}
                    </span>
                    <span className="story-title">{item.story.title}</span>
                    <span className="story-description">
                      {item.story.description}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={expanded.has(item.id) ? "rotated" : ""}
                  />
                </button>
                <div className="story-footer">
                  <span className="mini-icons">
                    {item.story.events.slice(0, 4).map((e) => (
                      <span key={e.id} className={e.category}>
                        <Icon category={e.category} size={13} />
                      </span>
                    ))}
                  </span>
                  <span>
                    {item.story.events.length}{" "}
                    {item.story.rule === "lighting"
                      ? "lights"
                      : "connected moments"}
                  </span>
                  {filtered && (
                    <span>
                      · {item.story.events.filter(matches).length} matching
                    </span>
                  )}
                  <button onClick={() => toggle(item.id)}>
                    {expanded.has(item.id)
                      ? "Close story"
                      : item.story.rule === "lighting"
                        ? "View lights"
                        : "View story"}
                    <ArrowRight size={13} />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {expanded.has(item.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="story-events"
                    >
                      <div className="story-evidence">
                        Grouped by timing
                        {["movie", "lighting"].includes(item.story.rule)
                          ? " and room"
                          : ""}{" "}
                        · not a causal claim
                      </div>
                      {item.story.events.map((e) => (
                        <div
                          key={e.id}
                          className={filtered && !matches(e) ? "dimmed" : ""}
                        >
                          {eventRow(e, true)}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }
  return <>{items.slice(0, limit).map(renderItem)}</>;
}

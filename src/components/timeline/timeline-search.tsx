"use client";

import { ArrowRight, ArrowUpRight, Search } from "lucide-react";

import { type Snapshot, type TimelineEvent } from "@/lib/types";

import { Icon, Modal, labels } from "./primitives";
import { timelineFormat } from "./format";
export function TimelineSearch({
  open,
  onOpenChange,
  search,
  onSearch,
  data,
  range,
  period,
  onInspect: inspect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearch: (search: string) => void;
  data: Snapshot | null;
  range: { start: string; end: string };
  period: string;
  onInspect: (event: TimelineEvent) => void;
}) {
  const allEvents = data?.events || [];
  const { time, day } = timelineFormat(data?.connection.timezone);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Search your home"
      description="Find an entity, a room, or a little moment."
    >
      <div className="command-input">
        <Search size={20} />
        <input
          autoFocus
          placeholder="Try “front door” or “Kevin”…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="search-results">
        {allEvents
          .filter(
            (e) =>
              !e.suppressed &&
              e.timestamp >= range.start &&
              e.timestamp < range.end &&
              (!search ||
                [e.title, e.entityId, e.room?.name, e.device?.name]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase())),
          )
          .slice(-6)
          .reverse()
          .map((e) => (
            <button
              key={e.id}
              onClick={() => {
                inspect(e);
                onOpenChange(false);
              }}
            >
              <Icon category={e.category} />
              <span>
                {e.title}
                <small>
                  {e.room?.name || labels[e.category]} · {time(e.timestamp)}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
      </div>
      <button
        className="primary-button full"
        onClick={() => onOpenChange(false)}
      >
        Show matching timeline
        <ArrowRight size={15} />
      </button>
      <p className="modal-note">
        Search applies to {period.toLowerCase()} · {day(range.start)}
      </p>
    </Modal>
  );
}

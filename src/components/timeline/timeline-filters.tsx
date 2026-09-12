"use client";

import * as Popover from "@radix-ui/react-popover";

import { Check, ChevronDown, Clock3, SlidersHorizontal, X } from "lucide-react";

import { categories, type Category, type HAState } from "@/lib/types";

import { labels } from "./primitives";

export type FilterSelection = {
  period: string;
  customStart: string;
  customEnd: string;
  room: string;
  person: string;
  category: string;
  search: string;
};
export function TimelineFilters({
  value,
  onChange,
  rooms,
  people,
  activeFilters,
  count,
}: {
  value: FilterSelection;
  onChange: (key: keyof FilterSelection, value: string) => void;
  rooms: { id: string; name: string }[];
  people: HAState[];
  activeFilters: { type: string; name: string; clear: () => void }[];
  count: number;
}) {
  const { period, customStart, customEnd, room, person, category } = value;
  return (
    <>
      {" "}
      <div className="timeline-toolbar">
        <div className="timeline-title">
          <h2>
            {period === "Live"
              ? "Today’s timeline"
              : period === "Custom range"
                ? "Your timeline"
                : period === "Today"
                  ? "Today’s timeline"
                  : period === "Yesterday"
                    ? "Yesterday’s timeline"
                    : "Last 24 hours"}
          </h2>
          <span className="event-count">{count} moments</span>
        </div>
        <div className="toolbar-actions">
          <Popover.Root>
            <Popover.Trigger className="filter-button">
              <Clock3 size={14} />
              <span>{period}</span>
              <ChevronDown size={13} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="popover time-popover"
                align="end"
                sideOffset={10}
              >
                {[
                  "Live",
                  "Today",
                  "Yesterday",
                  "Last 24 hours",
                  "Custom range",
                ].map((p) => (
                  <button
                    key={p}
                    className="menu-option"
                    onClick={() => onChange("period", p)}
                  >
                    {p}
                    {period === p && <Check size={15} />}
                  </button>
                ))}
                {period === "Custom range" && (
                  <div className="custom-range">
                    <label>
                      From
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) =>
                          onChange("customStart", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Through
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => onChange("customEnd", e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root>
            <Popover.Trigger className="filter-button">
              <SlidersHorizontal size={14} />
              <span>Filter</span>
              {activeFilters.length > 0 && (
                <span className="filter-number">{activeFilters.length}</span>
              )}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="popover filters-popover"
                align="end"
                sideOffset={10}
              >
                <h3>Find your moments</h3>
                <label>
                  Room
                  <select
                    value={room}
                    onChange={(e) => onChange("room", e.target.value)}
                  >
                    <option value="">Everywhere</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Person
                  <select
                    value={person}
                    onChange={(e) => onChange("person", e.target.value)}
                  >
                    <option value="">Everyone</option>
                    {people.map((p) => (
                      <option key={p.entity_id} value={p.entity_id}>
                        {String(p.attributes.friendly_name || p.entity_id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={category}
                    onChange={(e) => onChange("category", e.target.value)}
                  >
                    <option value="">All activity</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {labels[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="active-filters">
          {activeFilters.map((f) => (
            <button key={f.type} onClick={f.clear}>
              {f.name}
              <X size={12} />
            </button>
          ))}
          <button
            onClick={() => {
              onChange("room", "");
              onChange("person", "");
              onChange("category", "");
              onChange("search", "");
            }}
          >
            Clear all
          </button>
        </div>
      )}
    </>
  );
}

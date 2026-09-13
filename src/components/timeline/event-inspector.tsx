"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entityHistoryOptions } from "@/client/home-queries";

import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Code2,
  Zap,
} from "lucide-react";

import { type Snapshot, type TimelineEvent } from "@/lib/types";

import { Icon, Modal, labels } from "./primitives";
import { timelineFormat } from "./format";
export function EventInspector({
  event,
  data,
  range,
  onClose,
  onExclude,
}: {
  event: TimelineEvent;
  data: Snapshot | null;
  range: { start: string; end: string };
  onClose: () => void;
  onExclude: (entityId: string) => void;
}) {
  const [selected, setSelected] = useState(event);
  const [entityView, setEntityView] = useState(false);
  const demo = data?.connection.mode === "demo";
  const history = useQuery({
    ...entityHistoryOptions(
      data?.connection.sessionId || "",
      selected.entityId,
      range,
    ),
    enabled: entityView && !demo && !!data?.connection.sessionId,
  });
  const entityHistory = demo
    ? data.events.filter((e) => e.entityId === selected.entityId)
    : history.data?.events || [];
  const { time, day } = timelineFormat(data?.connection.timezone);
  const inspect = (value: TimelineEvent) => {
    setSelected(value);
    setEntityView(false);
  };
  return (
    <Modal
      wide
      open={!!selected}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={
        entityView
          ? data?.metadata[selected?.entityId || ""]?.name ||
            selected?.entityId ||
            "Entity"
          : selected?.title || "Event details"
      }
      description={
        selected
          ? `${day(selected.timestamp)} at ${time(selected.timestamp)} · ${labels[selected.category]}`
          : undefined
      }
    >
      {selected && (
        <>
          <div className="detail-banner">
            <span className={`event-icon ${selected.category}`}>
              <Icon category={selected.category} size={24} />
            </span>
            <div>
              <strong>
                {entityView
                  ? "Current state"
                  : selected.description || "A moment in your home’s story"}
              </strong>
              <p>
                {entityView
                  ? data?.states.find((s) => s.entity_id === selected.entityId)
                      ?.state || "Unavailable"
                  : selected.room?.name || "No room assigned"}
              </p>
            </div>
          </div>
          <button
            className="entity-link"
            onClick={() => setEntityView((v) => !v)}
          >
            <span>
              <small>ENTITY</small>
              <code>{selected.entityId}</code>
            </span>
            <span>
              {entityView ? "Event details" : "Inspect history"}
              <ArrowUpRight size={15} />
            </span>
          </button>
          {entityView ? (
            <div className="entity-history">
              {!demo && history.isPending && <p>Loading entity history…</p>}
              {!demo && history.isError && (
                <p role="alert">
                  Entity history could not be loaded.{" "}
                  <button onClick={() => void history.refetch()}>
                    Try again
                  </button>
                </p>
              )}
              {entityHistory.length
                ? entityHistory
                    .slice()
                    .reverse()
                    .map((e) => (
                      <button key={e.id} onClick={() => inspect(e)}>
                        <span>{time(e.timestamp)}</span>
                        <strong>
                          {e.suppressed
                            ? `${e.observation.previous?.state || "—"} → ${e.observation.current?.state || "—"}`
                            : e.title}
                        </strong>
                      </button>
                    ))
                : (demo || history.isSuccess) && (
                    <p>No retained history for this entity.</p>
                  )}
            </div>
          ) : (
            <>
              <div className="detail-section">
                <h3>What changed</h3>
                <div className="state-diff">
                  <span>{selected.observation.previous?.state || "—"}</span>
                  <ArrowRight size={16} />
                  <strong>
                    {selected.observation.current?.state ||
                      "Automation started"}
                  </strong>
                </div>
                {selected.observation.current &&
                  Object.entries(selected.observation.current.attributes)
                    .filter(
                      ([key, v]) =>
                        selected.observation.previous?.attributes[key] !== v &&
                        key !== "friendly_name",
                    )
                    .map(([key, v]) => (
                      <div className="attribute-diff" key={key}>
                        <code>{key}</code>
                        <span>
                          {String(
                            selected.observation.previous?.attributes[key] ??
                              "—",
                          )}{" "}
                          → {String(v)}
                        </span>
                      </div>
                    ))}
              </div>
              <div className="detail-section">
                <h3>Why did this happen?</h3>
                {selected.related?.length ? (
                  selected.related.map((r) => (
                    <div className="context-link" key={r.eventId}>
                      <Zap size={16} />
                      <span>
                        <small>
                          {r.relationship === "automation"
                            ? "Matched automation context"
                            : "Related activity"}
                        </small>
                        {r.title}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>
                    Cause unavailable. Home Assistant did not provide a
                    resolvable relationship in the retained evidence.
                  </p>
                )}
              </div>
              <details className="raw-details">
                <summary>
                  <Code2 size={15} />
                  Technical evidence
                  <ChevronDown size={14} />
                </summary>
                <p>
                  Sanitized source · {selected.observation.origin}. Sensitive
                  and unrelated attributes are omitted.
                </p>
                <pre>{JSON.stringify(selected.observation, null, 2)}</pre>
              </details>
            </>
          )}
          <button
            className="secondary-button full"
            onClick={() => {
              onExclude(selected.entityId);
              onClose();
            }}
          >
            Exclude this entity from the timeline
          </button>
        </>
      )}
    </Modal>
  );
}

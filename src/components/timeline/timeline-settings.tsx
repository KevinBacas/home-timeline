"use client";

import { ArrowRight, Moon, Settings2, Sun, X } from "lucide-react";

import { type Snapshot } from "@/lib/types";

import { Modal } from "./primitives";

export function TimelineSettings({
  open,
  onOpenChange,
  data,
  preferences,
  onConnect,
  disconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Snapshot | null;
  preferences: {
    theme: string;
    debug: boolean;
    excluded: string[];
    domains: string[];
    changeTheme: (value: string) => void;
    setDebug: React.Dispatch<React.SetStateAction<boolean>>;
    updateExclusions: (values: string[], domain?: boolean) => void;
  };
  onConnect: () => void;
  disconnect: () => Promise<void>;
}) {
  const {
    theme,
    debug,
    excluded,
    domains,
    changeTheme,
    setDebug,
    updateExclusions,
  } = preferences;
  const allEvents = data?.events || [];
  const demo = data?.connection.mode === "demo";
  const needsConnection = demo || data?.connection.mode === "error";
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Make yourself at home"
      description="A few preferences for a quieter timeline."
    >
      <div className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented">
          {[
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"],
          ].map(([v, l]) => (
            <button
              className={theme === v ? "selected" : ""}
              key={v}
              onClick={() => changeTheme(v)}
            >
              {v === "light" ? (
                <Sun size={15} />
              ) : v === "dark" ? (
                <Moon size={15} />
              ) : (
                <Settings2 size={15} />
              )}{" "}
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section setting-row">
        <div>
          <h3>Debug mode</h3>
          <p>Reveal technical updates and event evidence.</p>
        </div>
        <button
          className={`switch ${debug ? "on" : ""}`}
          role="switch"
          aria-checked={debug}
          aria-label="Debug mode"
          onClick={() => setDebug((v) => !v)}
        >
          <span />
        </button>
      </div>
      <div className="settings-section">
        <h3>Quieter by design</h3>
        <p>
          {data?.hiddenCount ?? allEvents.filter((e) => e.suppressed).length}{" "}
          technical updates hidden in this period.
        </p>
        <label>
          Exclude a domain
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              updateExclusions([...new Set([...domains, e.target.value])], true)
            }
          >
            <option value="">Choose a domain…</option>
            {[...new Set(allEvents.map((e) => e.entityId.split(".")[0]))]
              .sort()
              .map((d) => (
                <option key={d}>{d}</option>
              ))}
          </select>
        </label>
        <div className="active-filters">
          {domains.map((d) => (
            <button
              key={d}
              onClick={() =>
                updateExclusions(
                  domains.filter((x) => x !== d),
                  true,
                )
              }
            >
              {d}
              <X size={12} />
            </button>
          ))}
          {excluded.map((id) => (
            <button
              key={id}
              onClick={() => updateExclusions(excluded.filter((x) => x !== id))}
            >
              {data?.metadata[id]?.name || id}
              <X size={12} />
            </button>
          ))}
        </div>
        <h4>Most active entities</h4>
        {Object.entries(
          allEvents.reduce<Record<string, number>>(
            (acc, e) => ({
              ...acc,
              [e.entityId]: (acc[e.entityId] || 0) + 1,
            }),
            {},
          ),
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id, count]) => (
            <div className="noise-row" key={id}>
              <span>
                {data?.metadata[id]?.name || id}
                <small>
                  {count} updates ·{" "}
                  {
                    allEvents.filter((e) => e.entityId === id && e.suppressed)
                      .length
                  }{" "}
                  hidden
                </small>
              </span>
              <button
                onClick={() =>
                  updateExclusions(
                    excluded.includes(id)
                      ? excluded.filter((x) => x !== id)
                      : [...excluded, id],
                  )
                }
              >
                {excluded.includes(id) ? "Include" : "Exclude"}
              </button>
            </div>
          ))}
      </div>
      <div className="settings-section">
        <h3>Connection</h3>
        <p>
          {demo
            ? "Exploring the demo home"
            : data?.connection.mode === "error"
              ? "Connection unavailable"
              : data?.connection.managed
                ? "Configured through .env.local"
                : `Connected to ${data?.connection.name}`}
        </p>
        {needsConnection ? (
          <button
            className="primary-button full"
            onClick={() => {
              onOpenChange(false);
              onConnect();
            }}
          >
            Connect your home
            <ArrowRight size={15} />
          </button>
        ) : (
          <button className="secondary-button full" onClick={disconnect}>
            Disconnect and clear session
          </button>
        )}
      </div>
      <p className="modal-note">
        Home Timeline · Local-first, read-only, entirely yours.
      </p>
    </Modal>
  );
}

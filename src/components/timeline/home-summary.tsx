"use client";

import { homeTemperatureRange } from "@/lib/home-summary";

import { useMemo } from "react";

import { Lightbulb, ShieldCheck } from "lucide-react";

import { type Snapshot } from "@/lib/types";

import { timelineFormat } from "./format";
export function HomeSummary({
  data,
  clock,
  person,
  onPerson,
}: {
  data: Snapshot | null;
  clock: Date;
  person: string;
  onPerson: (id: string) => void;
}) {
  const people = (data?.states || []).filter((s) =>
    s.entity_id.startsWith("person."),
  );
  const { time } = timelineFormat(data?.connection.timezone);
  const lights = (data?.states || []).filter(
    (s) => s.entity_id.startsWith("light.") && s.state === "on",
  ).length;
  const temperatureRange = useMemo(
    () => homeTemperatureRange(data?.states || [], data?.metadata || {}),
    [data?.states, data?.metadata],
  );
  const formatTemperature = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
      value,
    );
  const lock = (data?.states || []).find((s) =>
    s.entity_id.startsWith("lock."),
  );
  return (
    <section className="home-now" aria-label="Home now">
      <div className="summary-label">
        <span className="eyebrow">HOME NOW</span>
        <span className="summary-clock">
          {data ? time(clock.toISOString()) : "—"}
        </span>
      </div>
      <div className="summary-content">
        <div className="people-summary">
          {people.slice(0, 3).map((s, i) => (
            <button
              key={s.entity_id}
              onClick={() =>
                onPerson(person === s.entity_id ? "" : s.entity_id)
              }
              className="person-summary"
            >
              <span className={`avatar avatar-${i}`}>
                {
                  String(
                    s.attributes.friendly_name || s.entity_id.split(".")[1],
                  )[0]
                }
              </span>
              <span>
                <strong>
                  {String(
                    s.attributes.friendly_name || s.entity_id.split(".")[1],
                  )}
                </strong>
                <small>
                  <span
                    className={`presence-dot ${s.state === "home" ? "at-home" : ""}`}
                  />
                  {s.state === "home"
                    ? "Home"
                    : s.state === "not_home"
                      ? "Away"
                      : s.state}
                </small>
              </span>
            </button>
          ))}
        </div>
        <span className="summary-separator" />
        <div
          className="temperature-summary"
          aria-label="Home temperature range"
        >
          <span>
            <span>Home temperature</span>
          </span>
          {temperatureRange ? (
            <span
              title={`${temperatureRange.sensors} indoor readings across ${temperatureRange.rooms} rooms · ${temperatureRange.unit}`}
            >
              <strong>
                {formatTemperature(temperatureRange.min)}° –{" "}
                {formatTemperature(temperatureRange.max)}°
              </strong>
              <span>{temperatureRange.unit}</span>
            </span>
          ) : (
            <span>No room readings</span>
          )}
        </div>
        <span className="summary-separator" />
        <div className="device-summary">
          <span>
            <Lightbulb size={15} />
            {lights} lights on
          </span>
          {lock && (
            <span>
              <ShieldCheck size={15} />
              {`${data?.metadata[lock.entity_id]?.name || "Lock"} ${lock.state}`}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

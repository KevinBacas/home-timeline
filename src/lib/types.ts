export type Category =
  | "presence"
  | "security"
  | "lighting"
  | "climate"
  | "motion"
  | "media"
  | "automation"
  | "device"
  | "system";
export const categories: Category[] = [
  "presence",
  "security",
  "motion",
  "lighting",
  "climate",
  "media",
  "automation",
  "device",
  "system",
];
export type Ref = { id: string; name: string };
export type Context = {
  id: string;
  parent_id?: string | null;
  user_id?: string | null;
};
export type HAState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context?: Context;
};
export type Metadata = Record<
  string,
  { name: string; room?: Ref; device?: Ref }
>;
export type Observation = {
  id: string;
  timestamp: string;
  entityId: string;
  previous?: HAState;
  current?: HAState;
  context?: Context;
  origin: "live" | "history" | "demo";
  type: "state" | "automation";
};
export type TimelineEvent = {
  id: string;
  version: 1;
  kind: string;
  timestamp: string;
  entityId: string;
  title: string;
  description?: string;
  category: Category;
  importance: "low" | "normal" | "important" | "critical";
  room?: Ref;
  device?: Ref;
  person?: Ref;
  observation: Observation;
  suppressed?: string;
  related?: {
    title: string;
    eventId: string;
    relationship: "automation" | "context";
  }[];
};
export type Story = {
  id: string;
  rule: "arrival" | "movie" | "activity" | "lighting";
  title: string;
  timestamp: string;
  end: string;
  events: TimelineEvent[];
  description: string;
};
export type TimelineItem =
  | { type: "event"; event: TimelineEvent; id: string; timestamp: string }
  | { type: "story"; story: Story; id: string; timestamp: string };
export type Connection = {
  mode: "demo" | "connected" | "reconnecting" | "error";
  configured: boolean;
  managed: boolean;
  name: string;
  timezone: string;
  message?: string;
  lastUpdate?: string;
  history: "idle" | "loading" | "ready" | "partial" | "unavailable";
};
export type Snapshot = {
  connection: Connection;
  states: HAState[];
  metadata: Metadata;
  events: TimelineEvent[];
  coverage?: { start: string; end: string };
  nextCursor?: string;
  hiddenCount?: number;
  noise?: { entityId: string; total: number; hidden: number }[];
};

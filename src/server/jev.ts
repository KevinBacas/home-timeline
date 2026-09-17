import { z } from "zod";
import type { StoryIntent, TimelineEvent } from "../lib/types";

const answerSchema = z.object({
  type: z.string().optional(),
  probability: z.number().min(0).max(1).optional(),
  noul: z.number().min(0).max(1).optional(),
});
const responseSchema = z.object({
  answers: z.record(z.string(), answerSchema),
});
const choiceResponseSchema = z.object({
  answers: z.record(
    z.string(),
    z.object({
      type: z.string().optional(),
      choice: z.string().optional(),
      probabilities: z.record(z.string(), z.number()).optional(),
    }),
  ),
});
const storyIntentSchema = z.enum([
  "movie_start",
  "welcome_home",
  "welcome_home_with_door",
  "lights_together",
  "room_activity",
  "automation_sequence",
  "unclear",
]);
type Pair = { a: TimelineEvent; b: TimelineEvent };

function pairKey(a: TimelineEvent, b: TimelineEvent) {
  return [a.id, b.id].sort().join("\n");
}
function summary(event: TimelineEvent) {
  return {
    id: event.id,
    at: event.timestamp,
    title: event.title,
    description: event.description,
    room: event.room?.name,
    category: event.category,
    kind: event.kind,
  };
}

export async function evaluateEventPairs(
  pairs: Pair[],
  token = process.env.JEV_TOKEN,
) {
  if (!token || !pairs.length) return new Map<string, boolean>();
  const questions = Object.fromEntries(
    pairs.map((_, index) => [
      `pair_${index}`,
      {
        type: "noul",
        instructions: `For pair ${index}, whose events are ${JSON.stringify(summary(pairs[index].a))} and ${JSON.stringify(summary(pairs[index].b))}: do these two home-activity events belong to the same short-lived human-readable moment? Say true only when they are meaningfully connected, not merely close in time.`,
        criteria: {
          true: "They describe one coherent activity or transition and should be shown as one compact group.",
          false:
            "They are unrelated, routine repetition, or should remain separate for inspection.",
        },
      },
    ]),
  );
  const state = pairs.map((pair, index) => ({
    pair: index,
    first: summary(pair.a),
    second: summary(pair.b),
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  timer.unref();
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 256_000) return null;
    const parsed = responseSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return null;
    return new Map(
      pairs.flatMap((pair, index) => {
        const answer = parsed.data.answers[`pair_${index}`];
        const probability = answer?.probability ?? answer?.noul;
        return probability !== undefined
          ? [[pairKey(pair.a, pair.b), probability >= 0.8] as const]
          : [];
      }),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function eventPairKey(a: TimelineEvent, b: TimelineEvent) {
  return pairKey(a, b);
}

const storyIntents: Record<Exclude<StoryIntent, "unclear">, string> = {
  movie_start:
    "A TV or media playback session is starting, often with lights settling.",
  welcome_home:
    "A person has arrived home and the events form a welcome-home moment.",
  welcome_home_with_door:
    "A person has arrived home and a door was closed as part of that return.",
  lights_together:
    "Several lights are being turned on together as one lighting action.",
  room_activity:
    "Several motion or occupancy events describe one period of activity in a room.",
  automation_sequence:
    "An automation and its immediate effects form one sequence.",
};

export async function evaluateEventGroupIntents(
  groups: { id: string; events: TimelineEvent[] }[],
  token = process.env.JEV_TOKEN,
) {
  if (!token || !groups.length) return new Map<string, StoryIntent>();
  const options = {
    ...storyIntents,
    unclear: "None of these descriptions fits confidently.",
  };
  const questions = Object.fromEntries(
    groups.map((group, index) => [
      `group_${index}`,
      {
        type: "choice",
        instructions: `Which predefined description best fits group ${index}? Choose unclear when the events do not clearly form one of the described moments.`,
        criteria: options,
      },
    ]),
  );
  const state = groups.map((group, index) => ({
    group: index,
    events: group.events.map(summary),
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  timer.unref();
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 256_000) return null;
    const parsed = choiceResponseSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return null;
    return new Map(
      groups.flatMap((group, index) => {
        const answer = parsed.data.answers[`group_${index}`];
        const choice = storyIntentSchema.safeParse(answer?.choice);
        const probability = choice.success
          ? answer.probabilities?.[choice.data]
          : undefined;
        return choice.success &&
          (probability === undefined || probability >= 0.75)
          ? [[group.id, choice.data] as const]
          : [[group.id, "unclear"] as const];
      }),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

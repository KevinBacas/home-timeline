import { createGateway, experimental_evaluate as evaluate } from "ai";
import type { StoryIntent, TimelineEvent } from "../lib/types";

type Pair = { a: TimelineEvent; b: TimelineEvent };

function evaluationModel(apiKey: string) {
  return createGateway({
    apiKey,
    // Bound the response before the SDK buffers and validates its JSON.
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (!response.body) return response;
      let bytes = 0;
      const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > 256_000)
              throw new Error("Jev response exceeded the size limit.");
            controller.enqueue(chunk);
          },
        }),
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  }).evaluationModel(process.env.AI_GATEWAY_MODEL || "typesafe-ai/jev");
}

function pairKey(a: TimelineEvent, b: TimelineEvent) {
  return [a.id, b.id].sort().join("\n");
}
function summary(event: TimelineEvent) {
  return {
    id: event.id,
    at: event.timestamp,
    title: event.title,
    ...(event.description !== undefined
      ? { description: event.description }
      : {}),
    ...(event.room ? { room: event.room.name } : {}),
    category: event.category,
    kind: event.kind,
  };
}

export async function evaluateEventPairs(
  pairs: Pair[],
  apiKey = process.env.AI_GATEWAY_API_KEY,
) {
  if (!apiKey || !pairs.length) return new Map<string, boolean>();
  const questions = Object.fromEntries(
    pairs.map((_, index) => [
      `pair_${index}`,
      {
        type: "boolean" as const,
        instructions: `For pair ${index} in the supplied state: do these two home-activity events belong to the same short-lived human-readable moment? Say true only when they are meaningfully connected, not merely close in time.`,
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
    const result = await evaluate({
      model: evaluationModel(apiKey),
      state,
      questions,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    return new Map(
      pairs.map((pair, index) => [
        pairKey(pair.a, pair.b),
        result.answers[`pair_${index}`].probability >= 0.8,
      ]),
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
  apiKey = process.env.AI_GATEWAY_API_KEY,
) {
  if (!apiKey || !groups.length) return new Map<string, StoryIntent>();
  const options = {
    ...storyIntents,
    unclear: "None of these descriptions fits confidently.",
  };
  const questions = Object.fromEntries(
    groups.map((group, index) => [
      `group_${index}`,
      {
        type: "choice" as const,
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
    const result = await evaluate({
      model: evaluationModel(apiKey),
      state,
      questions,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    return new Map(
      groups.map((group, index) => {
        const answer = result.answers[`group_${index}`];
        const probability = answer.probabilities?.[answer.choice];
        const intent: StoryIntent =
          probability === undefined || probability >= 0.75
            ? answer.choice
            : "unclear";
        return [group.id, intent];
      }),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

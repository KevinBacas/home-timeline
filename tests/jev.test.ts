import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEventPairs,
  evaluateEventGroupIntents,
  eventPairKey,
} from "../src/server/jev";
import { HomeRuntime } from "../src/server/runtime-core";
import { createDemo } from "../src/lib/demo";

const [a, b, c] = createDemo().events.filter((event) => !event.suppressed);
const apiKey = "synthetic-gateway-key";

function mockFetch(t: TestContext, implementation: typeof global.fetch) {
  return t.mock.method(global, "fetch", implementation);
}

function setEnv(t: TestContext, name: string, value?: string) {
  const previous = process.env[name];
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function response(answers: Record<string, unknown>) {
  return new Response(JSON.stringify({ answers }), {
    headers: { "content-type": "application/json" },
  });
}

test("Jev pairs use the AI Gateway evaluation SDK, compact summaries, and the existing confidence threshold", async (t) => {
  setEnv(t, "AI_GATEWAY_MODEL");
  mockFetch(t, async (input, init) => {
    assert.equal(
      String(input),
      "https://ai-gateway.vercel.sh/v4/ai/evaluation-model",
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${apiKey}`);
    assert.equal(headers.get("ai-model-id"), "typesafe-ai/jev");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.questions.pair_0.type, "boolean");
    assert.equal(request.state.length, 3);
    assert.equal(request.state[0].first.title, a.title);
    assert.equal(request.state[0].first.observation, undefined);
    assert.equal(request.state[0].first.room, undefined);
    assert.equal(request.state[0].first.description, undefined);
    assert.ok(!String(init?.body).includes(apiKey));
    return response({
      pair_0: { type: "boolean", probability: 0.8 },
      pair_1: { type: "boolean", probability: 0.79 },
      pair_2: { type: "boolean", probability: 0.01 },
    });
  });
  const result = await evaluateEventPairs(
    [
      { a: { ...a, room: undefined, description: undefined }, b },
      { a, b: c },
      { a: b, b: c },
    ],
    apiKey,
  );
  assert.deepEqual(
    result,
    new Map([
      [eventPairKey(a, b), true],
      [eventPairKey(c, a), false],
      [eventPairKey(b, c), false],
    ]),
  );
});

test("Jev reads the gateway key and optional model from the environment and reports configuration without exposing the key", async (t) => {
  setEnv(t, "AI_GATEWAY_API_KEY", apiKey);
  setEnv(t, "AI_GATEWAY_MODEL", "synthetic/evaluation-model");
  setEnv(t, "JEV_TOKEN");
  mockFetch(t, async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${apiKey}`);
    assert.equal(headers.get("ai-model-id"), "synthetic/evaluation-model");
    return response({ pair_0: { type: "boolean", probability: 0.95 } });
  });
  const result = await evaluateEventPairs([{ a, b }]);
  assert.equal(result?.get(eventPairKey(a, b)), true);
  const status = new HomeRuntime().status();
  assert.equal(status.connection.jev?.configured, true);
  assert.ok(!JSON.stringify(status).includes(apiKey));
});

test("Jev skips unconfigured or empty evaluations without calling the gateway", async (t) => {
  setEnv(t, "AI_GATEWAY_API_KEY");
  setEnv(t, "JEV_TOKEN", "obsolete-synthetic-token");
  const fetch = mockFetch(t, async () => {
    throw new Error("Unexpected gateway call");
  });
  assert.deepEqual(await evaluateEventPairs([{ a, b }]), new Map());
  assert.deepEqual(
    await evaluateEventGroupIntents([{ id: "group", events: [a, b] }]),
    new Map(),
  );
  assert.deepEqual(await evaluateEventPairs([], apiKey), new Map());
  assert.deepEqual(await evaluateEventGroupIntents([], apiKey), new Map());
  assert.equal(new HomeRuntime().status().connection.jev?.configured, false);
  assert.equal(fetch.mock.callCount(), 0);
});

test("Jev keeps confident story intents and falls back to unclear below the intent threshold", async (t) => {
  mockFetch(t, async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const options = request.questions.group_0.criteria;
    assert.equal(request.questions.group_0.type, "choice");
    assert.equal(request.state[0].events[0].title, a.title);
    const probabilities = (probability: number) =>
      Object.fromEntries(
        Object.keys(options).map((option) => [
          option,
          option === "welcome_home"
            ? probability
            : option === "unclear"
              ? 1 - probability
              : 0,
        ]),
      );
    return response({
      group_0: {
        type: "choice",
        choice: "welcome_home",
        probabilities: probabilities(0.75),
      },
      group_1: {
        type: "choice",
        choice: "welcome_home",
        probabilities: probabilities(0.74),
      },
      group_2: { type: "choice", choice: "room_activity" },
    });
  });
  const result = await evaluateEventGroupIntents(
    [
      { id: "confident", events: [a, b] },
      { id: "uncertain", events: [b, c] },
      { id: "without-distribution", events: [a, c] },
    ],
    apiKey,
  );
  assert.deepEqual(
    result,
    new Map([
      ["confident", "welcome_home"],
      ["uncertain", "unclear"],
      ["without-distribution", "room_activity"],
    ]),
  );
});

test("Jev gateway errors leave local grouping available without SDK retries", async (t) => {
  for (const status of [401, 429, 503]) {
    await t.test(`HTTP ${status}`, async (t) => {
      const fetch = t.mock.method(
        global,
        "fetch",
        async () =>
          new Response(JSON.stringify({ error: "Synthetic failure" }), {
            status,
            headers: { "content-type": "application/json" },
          }),
      );
      assert.equal(await evaluateEventPairs([{ a, b }], apiKey), null);
      assert.equal(
        await evaluateEventGroupIntents(
          [{ id: "group", events: [a, b] }],
          apiKey,
        ),
        null,
      );
      assert.equal(fetch.mock.callCount(), 2);
    });
  }
});

test("Jev rejects malformed, incomplete, and oversized gateway responses", async (t) => {
  const bodies = [
    "not JSON",
    JSON.stringify({ answers: {} }),
    JSON.stringify({ answers: { pair_0: { type: "noul", noul: 0.91 } } }),
    JSON.stringify({
      answers: { pair_0: { type: "boolean", probability: 1.1 } },
    }),
    JSON.stringify({
      answers: { pair_0: { type: "boolean", probability: 0.9 } },
      padding: "x".repeat(256_000),
    }),
  ];
  for (const [index, body] of bodies.entries()) {
    await t.test(`invalid response ${index}`, async (t) => {
      t.mock.method(
        global,
        "fetch",
        async () =>
          new Response(body, {
            headers: { "content-type": "application/json" },
          }),
      );
      assert.equal(await evaluateEventPairs([{ a, b }], apiKey), null);
    });
  }
});

test("Jev rejects story intents outside the predefined choices", async (t) => {
  mockFetch(t, async () =>
    response({ group_0: { type: "choice", choice: "invented_intent" } }),
  );
  assert.equal(
    await evaluateEventGroupIntents([{ id: "group", events: [a, b] }], apiKey),
    null,
  );
});

test("Jev cancels a slow gateway request after its existing deadline", async (t) => {
  // Keep the test alive while the application's deadline timer is unref'ed.
  const keepAlive = setTimeout(() => {}, 3000);
  t.after(() => clearTimeout(keepAlive));
  let signal: AbortSignal | undefined;
  mockFetch(t, async (_input, init) => {
    const requestSignal = init?.signal;
    assert.ok(requestSignal);
    signal = requestSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal.addEventListener(
        "abort",
        () => reject(requestSignal.reason),
        {
          once: true,
        },
      );
    });
  });
  assert.equal(await evaluateEventPairs([{ a, b }], apiKey), null);
  assert.equal(signal?.aborted, true);
});

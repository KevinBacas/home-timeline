import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEventPairs } from "../src/server/jev";
import { createDemo } from "../src/lib/demo";

test("Jev grouping uses the noul question type and accepts its response", async () => {
  const [a, b] = createDemo().events.filter((event) => !event.suppressed);
  const originalFetch = global.fetch;
  let request: { questions?: Record<string, { type: string }> } | undefined;
  global.fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ answers: { pair_0: { type: "noul", noul: 0.91 } } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await evaluateEventPairs([{ a, b }], "synthetic-token");
    assert.equal(request?.questions?.pair_0.type, "noul");
    assert.ok(result);
    assert.equal(result.size, 1);
    assert.equal([...result.values()][0], true);
  } finally {
    global.fetch = originalFetch;
  }
});

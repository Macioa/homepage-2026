import { beforeEach, expect, test, vi } from "vitest";
import { streamReply } from "./generate.js";
import { prefillRate } from "./prefillTiming.js";
import { fakeEngine, fakeStorage } from "./testing.js";

beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));

test("streams the reply, passing JSON mode and the token cap to WebLLM", async () => {
  const engine = fakeEngine({ pieces: ['{"a"', ":1}"] });
  const onFirstToken = vi.fn();
  let text = "";

  await streamReply(engine, [{ role: "user", content: "hi" }], {
    responseFormat: { type: "json_object", schema: "{}" },
    maxTokens: 64,
    onFirstToken,
    onText: (piece) => (text += piece),
  });

  expect(text).toBe('{"a":1}');
  expect(onFirstToken).toHaveBeenCalledOnce();
  expect(engine.requests[0]).toEqual({
    messages: [{ role: "user", content: "hi" }],
    response_format: { type: "json_object", schema: "{}" },
    max_tokens: 64,
    stream: true,
    stream_options: { include_usage: true },
  });
});

test("learns the prefill rate from the final usage chunk", async () => {
  const usage = { prompt_tokens: 2000, extra: { prefill_tokens_per_s: 31.4 } };
  await streamReply(fakeEngine({ pieces: ["x"], usage }), [], { onFirstToken() {}, onText() {} });
  expect(prefillRate()).toBe(31);
});

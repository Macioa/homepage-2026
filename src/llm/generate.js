// One completion over the given messages, streamed. With responseFormat set, WebLLM's JSON mode
// constrains the reply to that schema.

import { learnPrefillRate } from "./prefillTiming.js";

// Calls onFirstToken once when prompt reading ends, and onText for each piece of reply.
export async function streamReply(engine, messages, { responseFormat, maxTokens, onFirstToken, onText }) {
  const stream = await engine.chat.completions.create({
    messages,
    response_format: responseFormat,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  let first = true;
  for await (const chunk of stream) {
    if (first) {
      first = false;
      onFirstToken();
    }
    onText(chunk.choices[0]?.delta?.content ?? "");
    if (chunk.usage) learnPrefillRate(chunk.usage);
  }
}

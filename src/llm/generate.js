// One stateless prompt -> streamed reply. No conversation memory: only this prompt is sent.

import { learnPrefillRate } from "./prefillTiming.js";

// Calls onFirstToken once when prompt reading ends, and onText for each piece of reply.
export async function streamReply(engine, prompt, { onFirstToken, onText }) {
  const stream = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
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

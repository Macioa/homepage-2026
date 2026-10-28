// Test helpers for src/llm: a fake Web Storage and a fake WebLLM engine. Not imported by the app.

export function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

// Streams `pieces` one per tick. interruptGenerate() ends the stream early, like WebLLM.
// fail: an error thrown by create() instead of streaming.
export function fakeEngine({ pieces = ["Hel", "lo"], usage = null, fail = null, firstTokenDelayMs = 0 } = {}) {
  const engine = {
    requests: [],
    interrupted: false,
    interruptGenerate() {
      engine.interrupted = true;
    },
    chat: {
      completions: {
        async create(request) {
          engine.requests.push(request);
          if (fail) throw fail;
          engine.interrupted = false;
          return (async function* () {
            await new Promise((resolve) => setTimeout(resolve, firstTokenDelayMs));
            for (const content of pieces) {
              if (engine.interrupted) return;
              yield { choices: [{ delta: { content } }] };
              await new Promise((resolve) => setTimeout(resolve, 1));
            }
            if (usage) yield { choices: [], usage };
          })();
        },
      },
    },
  };
  return engine;
}

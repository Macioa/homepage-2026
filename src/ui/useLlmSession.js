// Bridges LlmSession to React state.

import { useEffect, useRef, useState } from "react";
import { LlmSession } from "../llm/session.js";

export function useLlmSession() {
  const [status, setStatus] = useState("Loading model...");
  const [ready, setReady] = useState(false);
  const sessionRef = useRef(null);
  // Stable handle for the harness (see webllmModel in src/harness/model.ts).
  const [model] = useState(() => ({
    complete: (messages, options) => sessionRef.current.complete(messages, options),
    stop: () => sessionRef.current?.stop("user"),
  }));

  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = new LlmSession({ onStatus: setStatus, onReady: () => setReady(true) });
    sessionRef.current.load();
  }, []);

  return {
    status,
    ready,
    model,
    reload: () => sessionRef.current?.reload(),
  };
}

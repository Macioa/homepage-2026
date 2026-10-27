// Bridges LlmSession to React state.

import { useEffect, useRef, useState } from "react";
import { LlmSession } from "../llm/session.js";

export function useLlmSession() {
  const [status, setStatus] = useState("Loading model...");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = new LlmSession({ onStatus: setStatus, onReady: () => setReady(true) });
    sessionRef.current.load();
  }, []);

  async function ask(prompt, onText) {
    setBusy(true);
    try {
      await sessionRef.current.ask(prompt, onText);
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    ready,
    busy,
    ask,
    stop: () => sessionRef.current?.stop("user"),
    reload: () => sessionRef.current?.reload(),
  };
}

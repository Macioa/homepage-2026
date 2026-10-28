// Bridges the agent harness to React: one harness per page, its Redux session as state.

import { useEffect, useState } from "react";
import { createHarness, webllmModel } from "../harness";
import { store } from "../store";
import { useAppSelector } from "../store/hooks";

// model: the handle from useLlmSession. ready: the model is loaded and warmed up.
export function useHarness(model, ready) {
  const [harness] = useState(() => createHarness({ store, model: webllmModel(model) }));
  const session = useAppSelector((s) => s.harness.session);

  useEffect(() => {
    if (!ready) return;
    harness.recover();
    if (import.meta.env.DEV) Object.assign(window, { harness });
  }, [ready, harness]);

  return { run: harness.run, stop: harness.stop, session };
}

import { useEffect, useRef, useState } from "react";
import { takeReloadNotice } from "../llm/pageReload.js";
import { activeCall } from "../harness/state/selectors";
import { useHarness } from "./useHarness.js";
import { useLlmSession } from "./useLlmSession.js";
import { useLoadProgress } from "./useLoadProgress.js";
import PixelBar from "./PixelBar.jsx";
import CrtFrame from "./CrtFrame.jsx";
import PromptInput from "./PromptInput.jsx";
import "./chat.css";

const GREETING =
  "Wake up, visitor... Follow the white rabbit. I'm Ryan's resume assistant. The AI has you. Ask me about Ryan's career experience.\n\n" +
  "(This is a browser based LLM with a dynamic memory load. Press the stop button to stop the LLM)";
// Roughly the size and pace of the model's own tokens, so typed text feeds like a reply.
const TYPE_CHUNK = /\S{1,4}\s*|\s+/g;
const TYPE_MS = 45;

// What the harness is doing right now, e.g. "> step 2 · calling search_experience..."
function stepLine(session) {
  const calling = activeCall(session);
  return `> step ${session.step} · ${calling ? `calling ${calling.tool}` : "thinking"}...`;
}

// Agent loop bar: scans while a turn runs, full once one has finished, empty before the first.
function loopProgress(status) {
  if (status === "running") return null;
  return status === "idle" ? 0 : 100;
}

// The POC's App.jsx, minus its <h1> (the page header already has one), plus load/warm-up bars and a CRT frame on the reply.
// Send goes through the agent harness (src/harness); its final answer is typed into the screen.
export default function Chat() {
  const { status, ready, model, reload } = useLlmSession();
  const { run, stop, session } = useHarness(model, ready);
  const busy = session.status === "running";
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(takeReloadNotice);
  const progress = useLoadProgress(status, ready);
  const typeTimer = useRef(null);

  function typeOut(text) {
    clearInterval(typeTimer.current);
    const chunks = text.match(TYPE_CHUNK) ?? [];
    let i = 0;
    typeTimer.current = setInterval(() => {
      if (i >= chunks.length) return clearInterval(typeTimer.current);
      const chunk = chunks[i++];
      setReply((r) => r + chunk);
    }, TYPE_MS);
  }

  // Once loaded and warmed, feed the greeting into an empty screen (a reload notice wins).
  useEffect(() => {
    if (!ready || reply) return;
    typeOut(GREETING);
    return () => clearInterval(typeTimer.current);
  }, [ready]); // only the reply at the moment of ready matters

  async function send() {
    if (!prompt.trim() || busy) return;
    clearInterval(typeTimer.current);
    setReply("");
    const turn = await run(prompt);
    typeOut(turn.answer ?? "");
  }

  return (
    <div className="llm">
      <div className="progress">
        <PixelBar label="Load" value={progress.load} />
        <PixelBar label="Warm" value={progress.warm} />
      </div>
      <p className="status">{status}</p>
      <PromptInput
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onSubmit={send}
        canSubmit={ready && !busy}
      />
      <div className="actions">
        <button onClick={send} disabled={!ready || busy}>
          {busy ? "Generating..." : "Send"}
        </button>
        <button onClick={stop} disabled={!busy}>
          Stop
        </button>
        <button onClick={reload}>Reload</button>
      </div>
      <CrtFrame>
        <pre className="reply">{busy ? stepLine(session) : reply}</pre>
      </CrtFrame>
      <div className="progress">
        <PixelBar label="Loop" value={loopProgress(session.status)} />
      </div>
    </div>
  );
}

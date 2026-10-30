import { useEffect, useRef, useState } from "react";
import PixelBar from "./PixelBar.jsx";
import CrtFrame from "./CrtFrame.jsx";
import PromptInput from "./PromptInput.jsx";
import "./chat.css";

const GREETING =
  "Wake up, visitor... Follow the white rabbit. I'm Ryan's resume assistant. Ask me about Ryan's career experience.";
// Small chunks at a steady pace, so typed text feeds like a reply.
const TYPE_CHUNK = /\S{1,4}\s*|\s+/g;
const TYPE_MS = 45;

// Loop bar: scans while a send runs, full once one has finished, empty before the first.
function loopProgress(status) {
  if (status === "running") return null;
  return status === "idle" ? 0 : 100;
}

// Gemini rate bar, prompt, Send/Stop, and a CRT screen the reply is typed into.
// onSend(prompt, signal) resolves to the answer text; without it, Send stays disabled.
// usage: calls in the shared Gemini rate window, its limit, and whether Send is locked.
/** @param {{ onSend?: (prompt: string, signal: AbortSignal) => Promise<string>, usage?: { used: number, limit: number, locked: boolean } }} props */
export default function Chat({ onSend = undefined, usage = { used: 0, limit: 10, locked: false } }) {
  const [status, setStatus] = useState("idle");
  const busy = status === "running";
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const typeTimer = useRef(null);
  const abort = useRef(null);
  const canSend = Boolean(onSend) && !busy && !usage.locked;

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

  // Feed the greeting into the empty screen.
  useEffect(() => {
    typeOut(GREETING);
    return () => clearInterval(typeTimer.current);
  }, []);

  async function send() {
    if (!prompt.trim() || !canSend) return;
    clearInterval(typeTimer.current);
    setReply("");
    setStatus("running");
    abort.current = new AbortController();
    const { signal } = abort.current;
    let answer;
    try {
      answer = await onSend(prompt, signal);
    } catch (err) {
      answer = signal.aborted ? "Stopped by user." : err.message;
    }
    setStatus(signal.aborted ? "stopped" : "done");
    typeOut(answer ?? "");
  }

  return (
    <div className="llm">
      <div className="progress">
        <PixelBar label="Rate" value={usage.used} max={usage.limit} />
      </div>
      <PromptInput
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onSubmit={send}
        canSubmit={canSend}
      />
      <div className="actions">
        <button onClick={send} disabled={!canSend}>
          {busy ? "Generating..." : "Send"}
        </button>
        <button onClick={() => abort.current?.abort()} disabled={!busy}>
          Stop
        </button>
      </div>
      <CrtFrame>
        <pre className="reply">{busy ? "> thinking..." : reply}</pre>
      </CrtFrame>
      <div className="progress">
        <PixelBar label="Loop" value={loopProgress(status)} />
      </div>
    </div>
  );
}

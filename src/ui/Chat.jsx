import { useEffect, useRef, useState } from "react";
import { takeReloadNotice } from "../llm/pageReload.js";
import { useLlmSession } from "./useLlmSession.js";
import { useLoadProgress } from "./useLoadProgress.js";
import PixelBar from "./PixelBar.jsx";
import CrtFrame from "./CrtFrame.jsx";
import PromptInput from "./PromptInput.jsx";
import "./chat.css";

const GREETING =
  "Wake up, visitor... Follow the white rabbit. I'm Ryan's resume assistant. The AI has you. Ask me about Ryan's career experience.\n\n" +
  "(This is a browser based LLM with a dynamic memory load. Press the stop button to stop the LLM)";
// Roughly the size and pace of the model's own tokens, so the greeting feeds like a reply.
const GREETING_CHUNK = /\S{1,4}\s*|\s+/g;
const GREETING_MS = 45;

// The POC's App.jsx, minus its <h1> (the page header already has one), plus load/warm-up bars and a CRT frame on the reply.
export default function Chat() {
  const { status, ready, busy, ask, stop, reload } = useLlmSession();
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(takeReloadNotice);
  const progress = useLoadProgress(status, ready);
  const greetTimer = useRef(null);

  // Once loaded and warmed, feed the greeting into an empty screen (a reload notice wins).
  useEffect(() => {
    if (!ready || reply) return;
    const chunks = GREETING.match(GREETING_CHUNK);
    let i = 0;
    greetTimer.current = setInterval(() => {
      if (i >= chunks.length) return clearInterval(greetTimer.current);
      const text = chunks[i++];
      setReply((r) => r + text);
    }, GREETING_MS);
    return () => clearInterval(greetTimer.current);
  }, [ready]); // only the reply at the moment of ready matters

  function send() {
    if (!prompt.trim()) return;
    clearInterval(greetTimer.current);
    setReply("");
    ask(prompt, (text) => setReply((r) => r + text));
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
        <pre className="reply">{reply}</pre>
      </CrtFrame>
    </div>
  );
}

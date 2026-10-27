import { useState } from "react";
import { takeReloadNotice } from "../llm/pageReload.js";
import { useLlmSession } from "./useLlmSession.js";
import { useLoadProgress } from "./useLoadProgress.js";
import PixelBar from "./PixelBar.jsx";
import CrtFrame from "./CrtFrame.jsx";
import PromptInput from "./PromptInput.jsx";
import "./chat.css";

// The POC's App.jsx, minus its <h1> (the page header already has one), plus load/warm-up bars and a CRT frame on the reply.
export default function Chat() {
  const { status, ready, busy, ask, stop, reload } = useLlmSession();
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(takeReloadNotice);
  const progress = useLoadProgress(status, ready);

  function send() {
    if (!prompt.trim()) return;
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
        placeholder="Ask something..."
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

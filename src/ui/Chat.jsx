import { useState } from "react";
import { takeReloadNotice } from "../llm/pageReload.js";
import { useLlmSession } from "./useLlmSession.js";
import "./chat.css";

// The POC's App.jsx, minus its <h1> (the page header already has one).
export default function Chat() {
  const { status, ready, busy, ask, stop, reload } = useLlmSession();
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(takeReloadNotice);

  function send() {
    if (!prompt.trim()) return;
    setReply("");
    ask(prompt, (text) => setReply((r) => r + text));
  }

  return (
    <div className="llm">
      <p className="status">{status}</p>
      <textarea
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
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
      <pre className="reply">{reply}</pre>
    </div>
  );
}

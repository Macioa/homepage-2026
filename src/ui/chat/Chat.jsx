import { Fragment, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import PixelBar from "./PixelBar.jsx";
import CrtFrame from "./CrtFrame.jsx";
import PromptInput from "./PromptInput.jsx";
import { canRecord, startRecording } from "./recorder.js";
import { TOOLS } from "../../tools";
import "./chat.css";

// Example prompts from the tools that have one.
const EXAMPLES = TOOLS.flatMap((tool) =>
  tool.examplePrompt ? [tool.examplePrompt] : [],
);
const EXAMPLE_MARK = "- ";
const GREETING =
  "Wake up, visitor... The AI has you.\n\nI'm Ryan's resume assistant. Ask me about Ryan's career experience." +
  `\n\n\nExamples:\n${EXAMPLES.map((example) => EXAMPLE_MARK + example).join("\n")}`;
// Small chunks at a steady pace, so typed text feeds like a reply.
const TYPE_CHUNK = /\S{1,4}\s*|\s+/g;
const TYPE_MS = 45;

// Microphone glyph; takes the button's text color and glow.
const MicIcon = () => (
  <svg
    className="mic-icon"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 18v4M8 22h8" />
  </svg>
);

// Speaker glyph; sound waves while speaking.
const SpeakerIcon = ({ speaking }) => (
  <svg
    className="mic-icon"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
    {speaking ? (
      <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
    ) : (
      <path d="M17 10l4 4M21 10l-4 4" />
    )}
  </svg>
);

const canSpeak = () => typeof speechSynthesis !== "undefined";
// Robot voice: flat, low and a little slow. Prefers an English voice; any voice works.
const ROBOT = { pitch: 0.1, rate: 0.85 };
const VOLUME_SETTLE_MS = 150;

// Loop bar: scans while a send runs, full once one has finished, empty before the first.
function loopProgress(status) {
  if (status === "running") return null;
  return status === "idle" ? 0 : 100;
}

// The greeting as typed so far, with each example line as a button that puts its prompt in the field.
function Greeting({ text, onPick }) {
  let example = 0;
  return text.split("\n").map((line, i, lines) => {
    const end = i < lines.length - 1 ? "\n" : "";
    if (!line.startsWith(EXAMPLE_MARK)) return line + end;
    const prompt = EXAMPLES[example++];
    return (
      <Fragment key={i}>
        <button
          type="button"
          className="example"
          onClick={() => onPick(prompt)}
        >
          {line}
        </button>
        {end}
      </Fragment>
    );
  });
}

// Gemini rate bar, prompt, Send/Stop, and a CRT screen the reply is typed into.
// onSend(prompt, signal) resolves to the answer text; without it, Send stays disabled.
// usage: calls in the shared Gemini rate window, its limit, and whether Send is locked.
// onTranscribe(audio, signal) resolves to the text of a recorded voice prompt; without it (or a mic), no Mic button.
/** @param {{ onSend?: (prompt: string, signal: AbortSignal) => Promise<string>, onTranscribe?: (audio: Blob, signal: AbortSignal) => Promise<string>, usage?: { used: number, limit: number, locked: boolean } }} props */
export default function Chat({
  onSend = undefined,
  onTranscribe = undefined,
  usage = { used: 0, limit: 10, locked: false },
}) {
  const [status, setStatus] = useState("idle");
  const busy = status === "running";
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const typeTimer = useRef(null);
  const abort = useRef(null);
  const root = useRef(null);
  const canSend = Boolean(onSend) && !busy && !usage.locked;
  // idle | recording | transcribing
  const [mic, setMic] = useState("idle");
  const recording = useRef(null);
  const [micSupported] = useState(canRecord);
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speechSupported] = useState(canSpeak);
  // Which panel fills the screen: null | "input" | "output".
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => e.key === "Escape" && setExpanded(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [expanded]);
  const panelClass = (name) =>
    expanded === name ? "panel panel-" + name + " expanded" : "panel panel-" + name;
  const expandButton = (name, label) => (
    <button
      type="button"
      className="expand"
      onClick={() => setExpanded(expanded === name ? null : name)}
      aria-pressed={expanded === name}
      aria-label={expanded === name ? `Collapse ${label}` : `Expand ${label}`}
      title={expanded === name ? "Collapse (Esc)" : "Expand"}
    >
      {expanded === name ? "⤡" : "⤢"}
    </button>
  );
  const canMic =
    Boolean(onTranscribe) &&
    micSupported &&
    !busy &&
    !usage.locked &&
    mic !== "transcribing";

  // Fill the prompt with a clicked example and focus the field with the caret after it.
  function pick(example) {
    flushSync(() => setPrompt(example));
    const field = root.current?.querySelector("textarea");
    field?.focus();
    field?.setSelectionRange(example.length, example.length);
  }

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

  function showError(message) {
    clearInterval(typeTimer.current);
    setReply(`Mic: ${message}`);
    setStatus("done");
  }

  // Appends a transcript to the prompt and puts the caret after it.
  function appendPrompt(text) {
    if (!text) return;
    let next = "";
    flushSync(() =>
      setPrompt((p) => {
        next = p && !/\s$/.test(p) ? `${p} ${text}` : p + text;
        return next;
      }),
    );
    const field = root.current?.querySelector("textarea");
    field?.focus();
    field?.setSelectionRange(next.length, next.length);
  }

  async function transcribe(audio) {
    recording.current = null;
    if (!audio) return setMic("idle");
    setMic("transcribing");
    const controller = new AbortController();
    abort.current = controller;
    try {
      appendPrompt((await onTranscribe(audio, controller.signal)).trim());
    } catch (err) {
      if (!controller.signal.aborted) showError(err.message);
    }
    setMic("idle");
  }

  // Tap to record, tap again to stop and transcribe into the prompt. Hitting the length cap transcribes too.
  async function toggleMic() {
    if (mic === "recording") return recording.current?.stop();
    let rec;
    try {
      rec = await startRecording();
    } catch (err) {
      return showError(err.message);
    }
    recording.current = rec;
    setMic("recording");
    rec.done.then(transcribe);
  }

  useEffect(() => () => void recording.current?.cancel(), []);
  useEffect(() => () => canSpeak() && speechSynthesis.cancel(), []);

  // Speech in progress: the text and how far into it the voice has got (last word boundary).
  const speech = useRef(null);

  // Speaks `text` from `from` at `vol`. Browsers fix an utterance's volume when it starts, so a volume change
  // mid-read cancels and resumes from the current word with the new volume.
  function speakFrom(text, from, vol) {
    const utterance = new SpeechSynthesisUtterance(text.slice(from));
    Object.assign(utterance, ROBOT, { volume: vol });
    const voice = speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    const current = { text, at: from, utterance };
    speech.current = current;
    utterance.onboundary = (e) => {
      current.at = from + e.charIndex;
    };
    // Only the live utterance ends the read; a cancelled one (replaced by a resume) doesn't.
    utterance.onend = utterance.onerror = () => {
      if (speech.current !== current) return;
      speech.current = null;
      setSpeaking(false);
    };
    speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    speech.current = null;
    speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Reads the reply screen aloud in a robot voice; a second tap stops it.
  function toggleSpeak() {
    if (speaking) return stopSpeaking();
    speechSynthesis.cancel();
    const text = root.current?.querySelector(".reply")?.textContent?.trim();
    if (!text) return;
    setSpeaking(true);
    speakFrom(text, 0, volume);
  }

  // Restarts once the slider settles, so a drag doesn't restart the voice on every step.
  const volumeTimer = useRef(null);
  function changeVolume(vol) {
    setVolume(vol);
    clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      const current = speech.current;
      if (!current) return;
      speech.current = null;
      speechSynthesis.cancel();
      speakFrom(current.text, current.at, vol);
    }, VOLUME_SETTLE_MS);
  }


  async function send() {
    if (!prompt.trim() || !canSend) return;
    clearInterval(typeTimer.current);
    setExpanded((e) => (e === "input" ? null : e));
    if (speechSupported) stopSpeaking();
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
    <div className="llm" ref={root}>
      <div className="progress">
        <PixelBar label="Throttle" value={usage.used} max={usage.limit} />
      </div>
      <div className={panelClass("input")}>
      {expandButton("input", "prompt")}
      <PromptInput
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onSubmit={send}
        canSubmit={canSend}
      />
      <div className="actions">
        {onTranscribe && micSupported && (
          <button
            type="button"
            className={mic === "recording" ? "mic recording" : "mic"}
            onClick={toggleMic}
            disabled={!canMic}
            aria-pressed={mic === "recording"}
            aria-label={
              mic === "recording" ? "Stop recording" : "Record voice prompt"
            }
          >
            {mic === "transcribing" ? "..." : <MicIcon />}
          </button>
        )}
        <button onClick={send} disabled={!canSend}>
          {busy ? "Generating..." : "Send"}
        </button>
        <button onClick={() => abort.current?.abort()} disabled={!busy}>
          Stop
        </button>
      </div>
      </div>
      <div className={panelClass("output")}>
      {expandButton("output", "reply")}
      <CrtFrame
        control={
          speechSupported && (
            <span className="crt-speak-group">
              <button
                type="button"
                className="crt-speak"
                onClick={toggleSpeak}
                disabled={busy}
                aria-pressed={speaking}
                aria-label={speaking ? "Stop reading" : "Read reply aloud"}
              >
                <SpeakerIcon speaking={speaking} />
              </button>
              {/* Volume applies from the next read; speech can't change volume mid-utterance. */}
              <input
                type="range"
                className="crt-volume"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Speech volume"
                style={{ "--fill": `${volume * 100}%` }}
              />
            </span>
          )
        }
      >
        <pre className="reply">
          {busy ? (
            "> thinking..."
          ) : status === "idle" ? (
            <Greeting text={reply} onPick={pick} />
          ) : (
            reply
          )}
        </pre>
      </CrtFrame>
      </div>
      <div className="progress">
        <PixelBar label="Loop" hideLabel value={loopProgress(status)} />
      </div>
    </div>
  );
}

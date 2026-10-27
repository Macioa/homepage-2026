import { useLayoutEffect, useRef, useState } from "react";

// Touch devices keep Enter as a newline (send with the button); keyboards send on Enter.
const touchKeyboard = () => matchMedia("(hover: none) and (pointer: coarse)").matches;

// Textarea with an 80s blinking block cursor. The native caret is hidden and a mirror of the
// text up to the caret is laid over the field, so the block lands exactly where typing goes.
export default function PromptInput({ value, onChange, onSubmit, canSubmit, ...props }) {
  const fieldRef = useRef(null);
  const mirrorRef = useRef(null);
  const [caret, setCaret] = useState({ at: value.length, selecting: false });
  const [touch] = useState(touchKeyboard);

  const syncCaret = () => {
    const el = fieldRef.current;
    if (el) setCaret({ at: el.selectionStart, selecting: el.selectionStart !== el.selectionEnd });
  };

  // Keep the mirror on top of the field's text box and scrolled with it.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    const mirror = mirrorRef.current;
    if (!el || !mirror) return;
    const place = () => {
      Object.assign(mirror.style, {
        top: `${el.offsetTop + el.clientTop}px`,
        left: `${el.offsetLeft + el.clientLeft}px`,
        width: `${el.clientWidth}px`,
        height: `${el.clientHeight}px`,
      });
      mirror.scrollTop = el.scrollTop;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(el);
    el.addEventListener("scroll", place);
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", place);
    };
  });

  function onKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey || touch || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (canSubmit) onSubmit();
  }

  const at = Math.min(caret.at, value.length);
  const under = value[at];
  return (
    <div className="prompt">
      <textarea
        ref={fieldRef}
        value={value}
        onChange={(e) => {
          onChange(e);
          syncCaret();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        onClick={syncCaret}
        enterKeyHint={touch ? "enter" : "send"}
        {...props}
      />
      <div ref={mirrorRef} className="prompt-mirror" aria-hidden="true">
        {value.slice(0, at)}
        {!caret.selecting && (
          <span className="prompt-cursor">{under && under !== "\n" ? under : " "}</span>
        )}
      </div>
    </div>
  );
}

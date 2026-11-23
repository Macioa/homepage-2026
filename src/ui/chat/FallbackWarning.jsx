// Tells the visitor the reply is coming from the fallback LLM. Stays up until dismissed or the next Send.
export default function FallbackWarning({ onDismiss }) {
  return (
    <div className="fallback-warning" role="alert">
      <svg
        className="fallback-icon"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 2 21h20z" />
        <path d="M12 10v5M12 18h.01" />
      </svg>
      <p>
        Preferred LLM is unavailable. A fallback LLM is being used, and the
        response may be lower quality.
      </p>
      <button type="button" onClick={onDismiss}>
        OK
      </button>
    </div>
  );
}

// Matrix-style progress bar: pixel blocks inside an open frame.
// value: 0-max, or null for an indeterminate scan. max 100 reads as a percentage, any other as value/max.
export default function PixelBar({ label, value, max = 100 }) {
  const scanning = value === null;
  const shown = scanning ? 0 : Math.min(Math.round(value), max);
  const pct = (shown / max) * 100;
  return (
    <div className="pixelbar">
      <span className="pixelbar-label">{label}</span>
      <span
        className={`pixelbar-frame${scanning ? " scanning" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={scanning ? undefined : shown}
      >
        <span className="pixelbar-fill" style={scanning ? undefined : { width: `${pct}%` }} />
      </span>
      <span className="pixelbar-value">{scanning ? "..." : max === 100 ? `${shown}%` : `${shown}/${max}`}</span>
    </div>
  );
}

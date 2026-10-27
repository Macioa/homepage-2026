// Matrix-style progress bar: pixel blocks inside an open frame.
// value: 0-100, or null for an indeterminate scan.
export default function PixelBar({ label, value }) {
  const scanning = value === null;
  const pct = scanning ? 0 : Math.round(value);
  return (
    <div className="pixelbar">
      <span className="pixelbar-label">{label}</span>
      <span
        className={`pixelbar-frame${scanning ? " scanning" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scanning ? undefined : pct}
      >
        <span className="pixelbar-fill" style={scanning ? undefined : { width: `${pct}%` }} />
      </span>
      <span className="pixelbar-value">{scanning ? "..." : `${pct}%`}</span>
    </div>
  );
}

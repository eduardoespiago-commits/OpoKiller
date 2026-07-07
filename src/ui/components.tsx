import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  hero = false,
}: {
  children: ReactNode;
  className?: string;
  hero?: boolean;
}) {
  return (
    <div className={`card ${hero ? "card-hero" : ""} ${className}`}>{children}</div>
  );
}

export function Stat({
  label,
  value,
  sub,
  small = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`num ${small ? "sm" : ""}`}>{value}</div>
      {sub != null && <div className="faint">{sub}</div>}
    </div>
  );
}

export function Bar({ value, accent = false }: { value: number; accent?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`bar ${accent ? "accent" : ""}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({
  children,
  variant = "",
}: {
  children: ReactNode;
  variant?: string;
}) {
  return <span className={`chip ${variant}`}>{children}</span>;
}

export function Empty({ icon = "🗒️", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint && <div className="faint mt">{hint}</div>}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt btn-row">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Rating({
  value,
  onChange,
  max = 5,
  labels,
}: {
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
  labels?: [string, string];
}) {
  return (
    <div>
      <div className="row" role="radiogroup">
        {Array.from({ length: max + 1 }, (_, i) => i).map((i) => (
          <button
            key={i}
            role="radio"
            aria-checked={value === i}
            className={`btn btn-sm ${value === i ? "btn-primary" : ""}`}
            style={{ minWidth: 40 }}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        ))}
      </div>
      {labels && (
        <div className="between faint" style={{ marginTop: 4 }}>
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (nextOpen: boolean) => void;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  subtitle,
  badge,
  actions,
  defaultOpen = true,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isOpen ?? internalOpen;

  function handleToggle() {
    const nextOpen = !open;

    if (isOpen === undefined) {
      setInternalOpen(nextOpen);
    }

    onToggle?.(nextOpen);
  }

  return (
    <section
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          borderBottom: open ? "1px solid #e5edf5" : "none",
          backgroundColor: open ? "#f8fafc" : "#ffffff",
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            cursor: "pointer",
            display: "grid",
            gap: "4px",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {title}
            </span>
            {badge && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#475569",
                  backgroundColor: "#e2e8f0",
                  borderRadius: "999px",
                  padding: "2px 8px",
                }}
              >
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <span
              style={{
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              {subtitle}
            </span>
          )}
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {actions}
          <button
            type="button"
            onClick={handleToggle}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            style={{
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#475569",
              borderRadius: "999px",
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open && (
        <div
          style={{
            padding: "16px",
            display: "grid",
            gap: "14px",
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

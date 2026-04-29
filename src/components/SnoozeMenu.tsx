import { useState } from "react";

type SnoozeMenuProps = {
  onSnooze: (mode: "1h" | "4h" | "tomorrow" | "custom", customValue?: string) => void;
  onUnsnooze?: () => void;
  hasActiveSnooze?: boolean;
  compact?: boolean;
};

export function SnoozeMenu({
  onSnooze,
  onUnsnooze,
  hasActiveSnooze,
  compact = false,
}: SnoozeMenuProps) {
  const [customValue, setCustomValue] = useState("");
  const [selectedMode, setSelectedMode] = useState<
    "1h" | "4h" | "tomorrow" | "custom"
  >("1h");

  if (compact) {
    return (
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selectedMode}
          onChange={(event) =>
            setSelectedMode(
              event.target.value as "1h" | "4h" | "tomorrow" | "custom",
            )
          }
          style={{
            ...buttonStyle,
            paddingRight: "28px",
          }}
        >
          <option value="1h">Snooze 1h</option>
          <option value="4h">Snooze 4h</option>
          <option value="tomorrow">Snooze Tomorrow</option>
          <option value="custom">Custom Time</option>
        </select>
        {selectedMode === "custom" && (
          <input
            type="datetime-local"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            style={{
              ...buttonStyle,
              cursor: "text",
              minWidth: "190px",
            }}
          />
        )}
        <button
          type="button"
          onClick={() =>
            onSnooze(
              selectedMode,
              selectedMode === "custom" ? customValue : undefined,
            )
          }
          disabled={selectedMode === "custom" && !customValue}
          style={{
            ...buttonStyle,
            backgroundColor:
              selectedMode === "custom" && !customValue ? "#e2e8f0" : "#ffffff",
            color:
              selectedMode === "custom" && !customValue ? "#64748b" : "#0f172a",
            cursor:
              selectedMode === "custom" && !customValue ? "not-allowed" : "pointer",
          }}
        >
          Apply Snooze
        </button>
        {hasActiveSnooze && onUnsnooze && (
          <button
            type="button"
            onClick={onUnsnooze}
            style={{
              ...buttonStyle,
              borderColor: "#93c5fd",
              color: "#1d4ed8",
              backgroundColor: "#eff6ff",
            }}
          >
            Unsnooze
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => onSnooze("1h")}
        style={buttonStyle}
      >
        Snooze 1h
      </button>
      <button
        type="button"
        onClick={() => onSnooze("4h")}
        style={buttonStyle}
      >
        Snooze 4h
      </button>
      <button
        type="button"
        onClick={() => onSnooze("tomorrow")}
        style={buttonStyle}
      >
        Snooze Tomorrow
      </button>
      <input
        type="datetime-local"
        value={customValue}
        onChange={(event) => setCustomValue(event.target.value)}
        style={{
          ...buttonStyle,
          cursor: "text",
          minWidth: "190px",
        }}
      />
      <button
        type="button"
        onClick={() => onSnooze("custom", customValue)}
        disabled={!customValue}
        style={{
          ...buttonStyle,
          backgroundColor: customValue ? "#ffffff" : "#e2e8f0",
          color: customValue ? "#0f172a" : "#64748b",
          cursor: customValue ? "pointer" : "not-allowed",
        }}
      >
        Apply Custom
      </button>
      {hasActiveSnooze && onUnsnooze && (
        <button
          type="button"
          onClick={onUnsnooze}
          style={{
            ...buttonStyle,
            borderColor: "#93c5fd",
            color: "#1d4ed8",
            backgroundColor: "#eff6ff",
          }}
        >
          Unsnooze
        </button>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 10px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
};

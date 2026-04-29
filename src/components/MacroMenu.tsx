import { useState } from "react";
import type { MacroDefinition, MacroId } from "../services/macros";

type MacroMenuProps = {
  macros: MacroDefinition[];
  disabled?: boolean;
  compact?: boolean;
  onApplyMacro: (macroId: MacroId) => void;
};

export function MacroMenu({
  macros,
  disabled,
  compact = false,
  onApplyMacro,
}: MacroMenuProps) {
  const [selectedMacroId, setSelectedMacroId] = useState<MacroId>(
    macros[0]?.id ?? "request_order_number",
  );
  const selectedMacro = macros.find((macro) => macro.id === selectedMacroId);

  if (macros.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={selectedMacroId}
          onChange={(event) => setSelectedMacroId(event.target.value as MacroId)}
          disabled={disabled}
          style={{
            minWidth: compact ? "180px" : "240px",
            border: "1px solid #cbd5e1",
            backgroundColor: disabled ? "#e2e8f0" : "#ffffff",
            color: disabled ? "#64748b" : "#0f172a",
            borderRadius: "10px",
            padding: "8px 10px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {macros.map((macro) => (
            <option key={macro.id} value={macro.id}>
              {macro.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onApplyMacro(selectedMacroId)}
          disabled={disabled}
          style={{
            border: "1px solid #1d4ed8",
            backgroundColor: disabled ? "#93c5fd" : "#2563eb",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {compact ? "Run Quick Action" : "Apply"}
        </button>
      </div>
      {!compact && selectedMacro && (
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          {selectedMacro.description}
        </p>
      )}
    </div>
  );
}

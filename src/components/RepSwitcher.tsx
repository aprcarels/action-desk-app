import type { RepProfile } from "../types/actionDesk";

type RepSwitcherProps = {
  reps: RepProfile[];
  currentRepId: string;
  onChange: (repId: string) => void;
};

export function RepSwitcher({
  reps,
  currentRepId,
  onChange,
}: RepSwitcherProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "6px",
        minWidth: "200px",
      }}
    >
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Current Rep
      </span>
      <select
        value={currentRepId}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          fontSize: "13px",
          backgroundColor: "#ffffff",
          color: "#0f172a",
        }}
      >
        {reps.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name} ({rep.role === "supervisor" ? "Supervisor" : "Rep"})
          </option>
        ))}
      </select>
    </label>
  );
}

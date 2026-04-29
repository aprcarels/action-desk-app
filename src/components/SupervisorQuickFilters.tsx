import type { SupervisorQuickFilter } from "../types/actionDesk";

type SupervisorQuickFiltersProps = {
  value: SupervisorQuickFilter;
  onChange: (value: SupervisorQuickFilter) => void;
};

const FILTERS: Array<{ value: SupervisorQuickFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unassigned", label: "Unassigned" },
  { value: "over_sla", label: "Over SLA" },
  { value: "waiting_on_customer", label: "Waiting on Customer" },
  { value: "resolved_today", label: "Resolved Today" },
];

export function SupervisorQuickFilters({
  value,
  onChange,
}: SupervisorQuickFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: "16px",
        padding: "12px 14px",
        border: "1px solid #d8e1ec",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
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
        Supervisor Filters
      </span>
      <div
        style={{
          display: "inline-flex",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        {FILTERS.map((filter, index) => (
          <button
            key={filter.value}
            type="button"
            onClick={value === filter.value ? undefined : () => onChange(filter.value)}
            style={{
              border: "none",
              borderLeft: index === 0 ? "none" : "1px solid #cbd5e1",
              backgroundColor: value === filter.value ? "#dbeafe" : "#ffffff",
              color: value === filter.value ? "#1d4ed8" : "#475569",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: value === filter.value ? "default" : "pointer",
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

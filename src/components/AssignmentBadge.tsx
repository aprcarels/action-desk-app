type AssignmentBadgeProps = {
  assignedRepName?: string;
  assignedRepInitials?: string;
  assignedRepNames?: string[];
  assignmentType?: "auto" | "manual";
};

export function AssignmentBadge({
  assignedRepName,
  assignedRepInitials,
  assignedRepNames,
  assignmentType,
}: AssignmentBadgeProps) {
  const hasMultipleAssignedReps = (assignedRepNames?.length ?? 0) > 1;
  const primaryDisplayName =
    hasMultipleAssignedReps
      ? assignedRepNames?.[0]
      : assignedRepInitials || assignedRepName || assignedRepNames?.[0];
  const additionalAssignedCount = Math.max(
    (assignedRepNames?.length ?? (assignedRepName ? 1 : 0)) - 1,
    0,
  );
  const assignedRepTitle =
    assignedRepNames && assignedRepNames.length > 1
      ? `Assigned CSRs: ${assignedRepNames.join(", ")}`
      : undefined;

  if (!primaryDisplayName) {
    return (
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "#92400e",
          backgroundColor: "#fef3c7",
          borderRadius: "999px",
          padding: "4px 8px",
        }}
      >
        Unassigned
      </span>
    );
  }

  return (
    <span
      style={{
        fontSize: "12px",
        fontWeight: 700,
        color: assignmentType === "manual" ? "#0f766e" : "#1d4ed8",
        backgroundColor: assignmentType === "manual" ? "#ccfbf1" : "#dbeafe",
        borderRadius: "999px",
        padding: "4px 8px",
      }}
      title={assignedRepTitle}
    >
      {assignmentType === "manual" ? "Taken by" : "Assigned to"}{" "}
      {primaryDisplayName}
      {additionalAssignedCount > 0 ? ` +${additionalAssignedCount}` : ""}
    </span>
  );
}

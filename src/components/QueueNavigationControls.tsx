type QueueNavigationControlsProps = {
  currentPosition?: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onBackToQueue?: () => void;
};

export function QueueNavigationControls({
  currentPosition,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onBackToQueue,
}: QueueNavigationControlsProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
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
        {onBackToQueue && (
          <button type="button" onClick={onBackToQueue} style={secondaryButtonStyle}>
            Back to Queue
          </button>
        )}
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          style={{
            ...secondaryButtonStyle,
            backgroundColor: hasPrevious ? "#ffffff" : "#e2e8f0",
            color: hasPrevious ? "#0f172a" : "#94a3b8",
            cursor: hasPrevious ? "pointer" : "not-allowed",
          }}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          style={{
            ...secondaryButtonStyle,
            backgroundColor: hasNext ? "#ffffff" : "#e2e8f0",
            color: hasNext ? "#0f172a" : "#94a3b8",
            cursor: hasNext ? "pointer" : "not-allowed",
          }}
        >
          Next
        </button>
      </div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {currentPosition && total > 0
          ? `Queue Position ${currentPosition} of ${total}`
          : `${total} visible ${total === 1 ? "thread" : "threads"}`}
      </div>
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

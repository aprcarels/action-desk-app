type SyncStatusBannerProps = {
  status: "idle" | "ok" | "error";
  message?: string | null;
};

export function SyncStatusBanner({
  status,
  message,
}: SyncStatusBannerProps) {
  if (status === "idle" || !message) {
    return null;
  }

  const isError = status === "error";

  return (
    <div
      style={{
        border: `1px solid ${isError ? "#fca5a5" : "#86efac"}`,
        backgroundColor: isError ? "#fef2f2" : "#f0fdf4",
        color: isError ? "#991b1b" : "#166534",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "20px",
        fontSize: "13px",
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}

type DiagnosticsPanelProps = {
  apiAvailable: boolean;
  databaseReady?: boolean;
  currentUserLabel?: string;
  lastSyncAt?: string | null;
  lastBackupPath?: string | null;
  databasePath?: string | null;
  logFilePath?: string | null;
  backupLoading?: boolean;
  backupError?: string | null;
  canCreateBackup: boolean;
  onRefreshHealth: () => void;
  onCreateBackup?: () => void;
};

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Not available yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function DiagnosticsPanel({
  apiAvailable,
  databaseReady,
  currentUserLabel,
  lastSyncAt,
  lastBackupPath,
  databasePath,
  logFilePath,
  backupLoading = false,
  backupError,
  canCreateBackup,
  onRefreshHealth,
  onCreateBackup,
}: DiagnosticsPanelProps) {
  return (
    <details
      style={{
        marginTop: "18px",
        border: "1px solid #d8e1ec",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
        padding: "14px 16px",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Diagnostics
      </summary>

      <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
          <strong>API:</strong> {apiAvailable ? "Available" : "Unavailable"}
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
          <strong>Database:</strong>{" "}
          {databaseReady === undefined
            ? "Checking"
            : databaseReady
              ? "Ready"
              : "Unavailable"}
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
          <strong>Signed-in workflow user:</strong> {currentUserLabel ?? "None"}
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
          <strong>Last successful sync:</strong> {formatTimestamp(lastSyncAt)}
        </p>
        {databasePath && (
          <p style={{ margin: 0, fontSize: "13px", color: "#334155", wordBreak: "break-all" }}>
            <strong>Database path:</strong> {databasePath}
          </p>
        )}
        {logFilePath && (
          <p style={{ margin: 0, fontSize: "13px", color: "#334155", wordBreak: "break-all" }}>
            <strong>Log file:</strong> {logFilePath}
          </p>
        )}
        {lastBackupPath && (
          <p style={{ margin: 0, fontSize: "13px", color: "#334155", wordBreak: "break-all" }}>
            <strong>Last backup:</strong> {lastBackupPath}
          </p>
        )}
        {backupError && (
          <p style={{ margin: 0, fontSize: "13px", color: "#991b1b" }}>
            {backupError}
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onRefreshHealth}
            style={{
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Refresh Diagnostics
          </button>
          {canCreateBackup && onCreateBackup && (
            <button
              type="button"
              onClick={onCreateBackup}
              disabled={backupLoading}
              style={{
                border: "1px solid #0f766e",
                backgroundColor: backupLoading ? "#99f6e4" : "#0f766e",
                color: "#ffffff",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: backupLoading ? "not-allowed" : "pointer",
              }}
            >
              {backupLoading ? "Creating Backup..." : "Create Backup"}
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

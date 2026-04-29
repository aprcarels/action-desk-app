type AuthPanelProps = {
  loading: boolean;
  onSignIn: () => Promise<void>;
  statusMessage?: string | null;
};

export function AuthPanel({
  loading,
  onSignIn,
  statusMessage,
}: AuthPanelProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        backgroundColor: "#f3f6fb",
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          border: "1px solid #d8e1ec",
          borderRadius: "18px",
          backgroundColor: "#ffffff",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
          padding: "24px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#0f172a" }}>Action Desk</h1>
          <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#475569", lineHeight: 1.6 }}>
            Sign in with Microsoft to access the shared workflow queue. Your Action Desk role and permissions are resolved by the backend after sign-in.
          </p>
        </div>

        {statusMessage && (
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#991b1b",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              padding: "10px 12px",
            }}
          >
            {statusMessage}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            void onSignIn();
          }}
          disabled={loading}
          style={{
            border: "1px solid #0f766e",
            backgroundColor: loading ? "#99f6e4" : "#0f766e",
            color: "#ffffff",
            borderRadius: "12px",
            padding: "12px 14px",
            fontSize: "14px",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing In..." : "Sign in with Microsoft"}
        </button>
      </div>
    </div>
  );
}

import { Component, type ReactNode, useEffect, useState } from "react";
import { CustomerListManager } from "./CustomerListManager";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { UserAccessManager } from "./UserAccessManager";
import { getLocationLabel } from "../services/locations";
import { normalizeSlaSettings } from "../services/sla";
import type {
  AppCapability,
  ManagedUser,
  ManagedUserDraft,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
  SlaSettings,
} from "../types/actionDesk";

type SettingsPanelProps = {
  isOpen: boolean;
  currentUser: RepProfile;
  reps: RepProfile[];
  capabilities: AppCapability[];
  customers: SavedCustomer[];
  slaSettings: SlaSettings;
  onClose: () => void;
  onSaveCustomer: (draft: SavedCustomerDraft) => void;
  onSaveSlaSettings: (settings: SlaSettings) => void;
  onDeleteCustomer: (customerId: string) => void;
  onClearAllCustomers: () => void;
  onCreateTestQueueData?: () => void;
  onRemoveTestQueueData?: () => void;
  testQueueDataLoading?: boolean;
  adminUsers?: ManagedUser[];
  onCreateUserAccess?: (draft: ManagedUserDraft) => void;
  onUpdateUserAccess?: (payload: {
    userId: string;
    displayName?: string;
    initials?: string;
    role?: RepProfile["role"];
    locationId?: string;
    isActive?: boolean;
  }) => void;
  onDeactivateUserAccess?: (userId: string) => void;
  diagnostics?: {
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
};

type SettingsPanelErrorBoundaryProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

type SettingsPanelErrorBoundaryState = {
  error: Error | null;
};

class SettingsPanelErrorBoundary extends Component<
  SettingsPanelErrorBoundaryProps,
  SettingsPanelErrorBoundaryState
> {
  state: SettingsPanelErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): SettingsPanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("SETTINGS PANEL RENDER FAILED", {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }

  componentDidUpdate(previousProps: SettingsPanelErrorBoundaryProps) {
    if (previousProps.isOpen && !this.props.isOpen && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <SettingsPanelFallback
        error={this.state.error}
        onClose={this.props.onClose}
      />
    );
  }
}

function SettingsPanelFallback({
  error,
  onClose,
}: {
  error: Error;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-error-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(860px, 100%)",
          height: "100%",
          backgroundColor: "#f8fafc",
          boxShadow: "-16px 0 40px rgba(15, 23, 42, 0.18)",
          padding: "24px 20px 28px",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            border: "1px solid #fecaca",
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h2 id="settings-panel-error-title" style={{ margin: "0 0 8px", fontSize: "18px" }}>
            Settings could not be displayed
          </h2>
          <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.5 }}>
            {error.message || "A settings field was not in the expected shape."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: "16px",
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
          Close
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({
  isOpen,
  onClose,
  ...props
}: SettingsPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <SettingsPanelErrorBoundary isOpen={isOpen} onClose={onClose}>
      <SettingsPanelContent isOpen={isOpen} onClose={onClose} {...props} />
    </SettingsPanelErrorBoundary>
  );
}

function SettingsPanelContent({
  isOpen,
  currentUser,
  reps,
  capabilities,
  customers,
  slaSettings,
  onClose,
  onSaveCustomer,
  onSaveSlaSettings,
  onDeleteCustomer,
  onClearAllCustomers,
  onCreateTestQueueData,
  onRemoveTestQueueData,
  testQueueDataLoading = false,
  adminUsers,
  onCreateUserAccess,
  onUpdateUserAccess,
  onDeactivateUserAccess,
  diagnostics,
}: SettingsPanelProps) {
  if (!isOpen) {
    return null;
  }

  const safeCapabilities = Array.isArray(capabilities) ? capabilities : [];
  const safeReps = Array.isArray(reps) ? reps : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeAdminUsers = Array.isArray(adminUsers) ? adminUsers : [];
  const safeSlaSettings = normalizeSlaSettings(slaSettings);
  const canManageCustomerOwnership =
    currentUser.role === "admin" ||
    safeCapabilities.includes("manage_customer_ownership");
  const canManageSlaSettings =
    currentUser.role === "admin" || safeCapabilities.includes("manage_sla_settings");
  const canManageUsers =
    currentUser.role === "admin" || safeCapabilities.includes("manage_users");
  const canUseAdminTestData = currentUser.role === "admin";
  const assignmentsCount = safeCustomers.reduce(
    (count, customer) =>
      count +
      (customer.assignedCSRs?.filter((assignment) => assignment.isActive !== false)
        .length ?? customer.ownerRepIds?.length ?? (customer.ownerRepId ? 1 : 0)),
    0,
  );

  useEffect(() => {
    console.info("[Action Desk settings] data counts", {
      usersCount: safeAdminUsers.length,
      repsCount: safeReps.length,
      customersCount: safeCustomers.length,
      assignmentsCount,
      capabilities: safeCapabilities,
    });
  }, [
    assignmentsCount,
    currentUser.id,
    safeAdminUsers.length,
    safeCapabilities,
    safeCustomers.length,
    safeReps.length,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(860px, 100%)",
          height: "100%",
          backgroundColor: "#f8fafc",
          boxShadow: "-16px 0 40px rgba(15, 23, 42, 0.18)",
          padding: "24px 20px 28px",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "start",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2
              id="settings-panel-title"
              style={{ margin: 0, fontSize: "24px", color: "#0f172a" }}
            >
              Settings
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#475569" }}>
              Manage shared workflow settings, customer ownership, and admin operations.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
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
            Close
          </button>
        </div>

        <div
          style={{
            marginBottom: "18px",
            border: "1px solid #d8e1ec",
            borderRadius: "14px",
            backgroundColor: "#ffffff",
            padding: "16px",
          }}
        >
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Signed In As
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            {currentUser.name}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
            {currentUser.email} | {currentUser.role === "admin" ? "Admin" : currentUser.role === "supervisor" ? "Supervisor" : "Rep"}
            {currentUser.locationId ? ` | ${getLocationLabel(currentUser.locationId)}` : ""}
          </p>
        </div>

        <CustomerListManager
          currentRep={currentUser}
          reps={safeReps}
          customers={safeCustomers}
          canManage={canManageCustomerOwnership}
          onSaveCustomer={onSaveCustomer}
          onDeleteCustomer={onDeleteCustomer}
          onClearAllCustomers={onClearAllCustomers}
        />

        <SlaSettingsManager
          currentUser={currentUser}
          slaSettings={safeSlaSettings}
          canManage={canManageSlaSettings}
          onSave={onSaveSlaSettings}
        />

        {canManageUsers &&
          Array.isArray(adminUsers) &&
          onCreateUserAccess &&
          onUpdateUserAccess &&
          onDeactivateUserAccess && (
            <UserAccessManager
              users={safeAdminUsers}
              onCreateUser={onCreateUserAccess}
              onUpdateUser={onUpdateUserAccess}
              onDeactivateUser={onDeactivateUserAccess}
            />
        )}

        {canUseAdminTestData && onCreateTestQueueData && onRemoveTestQueueData && (
          <AdminTestDataManager
            loading={testQueueDataLoading}
            onCreate={onCreateTestQueueData}
            onRemove={onRemoveTestQueueData}
          />
        )}

        {diagnostics && currentUser.role === "admin" && (
          <DiagnosticsPanel
            apiAvailable={diagnostics.apiAvailable}
            databaseReady={diagnostics.databaseReady}
            currentUserLabel={diagnostics.currentUserLabel}
            lastSyncAt={diagnostics.lastSyncAt}
            lastBackupPath={diagnostics.lastBackupPath}
            databasePath={diagnostics.databasePath}
            logFilePath={diagnostics.logFilePath}
            backupLoading={diagnostics.backupLoading}
            backupError={diagnostics.backupError}
            canCreateBackup={diagnostics.canCreateBackup}
            onRefreshHealth={diagnostics.onRefreshHealth}
            onCreateBackup={diagnostics.onCreateBackup}
          />
        )}
      </div>
    </div>
  );
}

function AdminTestDataManager(props: {
  loading: boolean;
  onCreate: () => void;
  onRemove: () => void;
}) {
  const cardStyle: React.CSSProperties = {
    marginTop: "18px",
    border: "1px solid #d8e1ec",
    borderRadius: "14px",
    backgroundColor: "#ffffff",
    padding: "16px",
  };
  const secondaryButtonStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: "10px",
    padding: "9px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: props.loading ? "not-allowed" : "pointer",
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          marginBottom: "14px",
          paddingBottom: "12px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
          Admin Test Queue Data
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
          Creates clearly labeled TEST DATA messages in the shared queue so admins can verify workflow behavior without receiving customer email. Remove them before working real queues.
        </p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={props.onCreate}
          disabled={props.loading}
          style={{
            ...secondaryButtonStyle,
            borderColor: "#0f766e",
            backgroundColor: props.loading ? "#99f6e4" : "#0f766e",
            color: "#ffffff",
          }}
        >
          {props.loading ? "Working..." : "Create Test Queue Data"}
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          disabled={props.loading}
          style={{
            ...secondaryButtonStyle,
            borderColor: "#fecaca",
            color: "#991b1b",
            backgroundColor: "#fff7f7",
          }}
        >
          Remove Test Queue Data
        </button>
      </div>
    </div>
  );
}

function SlaSettingsManager(props: {
  currentUser: RepProfile;
  slaSettings: SlaSettings;
  canManage: boolean;
  onSave: (settings: SlaSettings) => void;
}) {
  const [formState, setFormState] = useState<SlaSettings>(props.slaSettings);

  useEffect(() => {
    setFormState(props.slaSettings);
  }, [props.slaSettings]);

  const normalizedFormState = normalizeSlaSettings(formState);

  const cardStyle: React.CSSProperties = {
    marginTop: "18px",
    border: "1px solid #d8e1ec",
    borderRadius: "14px",
    backgroundColor: "#ffffff",
    padding: "16px",
  };

  const fieldLabelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "6px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "#0f172a",
    boxSizing: "border-box",
    backgroundColor: "#ffffff",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: "10px",
    padding: "9px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const primaryButtonStyle: React.CSSProperties = {
    border: "1px solid #0f766e",
    backgroundColor: "#0f766e",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "9px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          marginBottom: "14px",
          paddingBottom: "12px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
          SLA Settings
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#334155" }}>
          First Response SLA = how fast we expect the first reply. Resolution SLA = how fast we expect the issue to be completed.
        </p>
        {!props.canManage && (
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b" }}>
            SLA settings are view-only for reps. Supervisors and admins manage the shared thresholds.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <label style={fieldLabelStyle} htmlFor="sla-first-response">
              First Response SLA Minutes
            </label>
            <input
              id="sla-first-response"
              type="number"
              min={1}
              value={formState.firstResponseSlaMinutes}
              disabled={!props.canManage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  firstResponseSlaMinutes: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor="sla-resolution">
              Resolution SLA Minutes
            </label>
            <input
              id="sla-resolution"
              type="number"
              min={1}
              value={formState.resolutionSlaMinutes}
              disabled={!props.canManage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  resolutionSlaMinutes: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor="sla-warning-percent">
              Warning Threshold Percent
            </label>
            <input
              id="sla-warning-percent"
              type="number"
              min={1}
              max={99}
              value={formState.warningThresholdPercent}
              disabled={!props.canManage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  warningThresholdPercent: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabelStyle} htmlFor="sla-warning-minutes">
              Warning Minutes Before Breach
            </label>
            <input
              id="sla-warning-minutes"
              type="number"
              min={1}
              value={formState.warningMinutesBeforeBreach}
              disabled={!props.canManage}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  warningMinutesBeforeBreach: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            border: "1px dashed #cbd5e1",
            borderRadius: "12px",
            padding: "10px 12px",
            fontSize: "12px",
            lineHeight: 1.6,
            color: "#475569",
          }}
        >
          At Risk starts when either the warning percentage or the warning minutes-before-breach window is reached, whichever happens first.
          {props.slaSettings.updatedAt
            ? ` Last updated ${new Date(props.slaSettings.updatedAt).toLocaleString()}${props.slaSettings.updatedByRepName ? ` by ${props.slaSettings.updatedByRepName}` : ""}.`
            : ""}
        </div>

        {props.canManage && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => props.onSave(normalizedFormState)}
              style={primaryButtonStyle}
            >
              Save SLA Settings
            </button>
            <button
              type="button"
              onClick={() => setFormState(props.slaSettings)}
              style={secondaryButtonStyle}
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { ManagedUser, ManagedUserDraft, RepProfile } from "../types/actionDesk";
import {
  ACTION_DESK_LOCATIONS,
  getLocationLabel,
  normalizeLocationId,
} from "../services/locations";

type UserAccessManagerProps = {
  users: ManagedUser[];
  onCreateUser: (payload: ManagedUserDraft) => void;
  onUpdateUser: (payload: {
    userId: string;
    displayName?: string;
    initials?: string;
    role?: RepProfile["role"];
    locationId?: string;
    isActive?: boolean;
  }) => void;
  onDeactivateUser: (userId: string) => void;
};

type UserFormState = {
  userId?: string;
  displayName: string;
  initials: string;
  email: string;
  role: RepProfile["role"];
  locationId: string;
  isActive: boolean;
};

const emptyFormState: UserFormState = {
  displayName: "",
  initials: "",
  email: "",
  role: "rep",
  locationId: "apexpress_irwindale",
  isActive: true,
};

function normalizeInitials(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
}

function getRoleLabel(role: RepProfile["role"]): string {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "supervisor") {
    return "Supervisor";
  }

  return "Rep";
}

function getValidationMessage(formState: UserFormState): string | null {
  if (!formState.displayName.trim()) {
    return "Display name is required.";
  }

  if (!formState.email.trim()) {
    return "Email is required.";
  }

  return null;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getRoleBadgeStyle(role: RepProfile["role"]): React.CSSProperties {
  if (role === "admin") {
    return {
      backgroundColor: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  if (role === "supervisor") {
    return {
      backgroundColor: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #93c5fd",
    };
  }

  return {
    backgroundColor: "#e2e8f0",
    color: "#334155",
    border: "1px solid #cbd5e1",
  };
}

export function UserAccessManager({
  users,
  onCreateUser,
  onUpdateUser,
  onDeactivateUser,
}: UserAccessManagerProps) {
  const [formState, setFormState] = useState<UserFormState>(emptyFormState);
  const [showValidation, setShowValidation] = useState(false);
  const safeUsers = Array.isArray(users) ? users : [];
  const safeLocations = ACTION_DESK_LOCATIONS ?? [];
  const sortedUsers = useMemo(
    () =>
      [...safeUsers].sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }

        return (left.displayName ?? left.name ?? "").localeCompare(
          right.displayName ?? right.name ?? "",
        );
      }),
    [safeUsers],
  );
  const validationMessage = getValidationMessage(formState);
  const isEditing = Boolean(formState.userId);

  const cardStyle: React.CSSProperties = {
    border: "1px solid #d8e1ec",
    borderRadius: "14px",
    backgroundColor: "#ffffff",
    padding: "16px",
  };

  const labelStyle: React.CSSProperties = {
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

  function resetForm() {
    setFormState(emptyFormState);
    setShowValidation(false);
  }

  function handleEdit(user: ManagedUser) {
    setFormState({
      userId: user.id,
      displayName: user.displayName ?? user.name ?? "",
      initials: user.initials ?? "",
      email: user.email ?? "",
      role: user.role,
      locationId: normalizeLocationId(user.locationId) ?? "apexpress_irwindale",
      isActive: user.isActive,
    });
    setShowValidation(false);
  }

  function handleSubmit() {
    setShowValidation(true);

    if (validationMessage) {
      return;
    }

    const payload = {
      displayName: formState.displayName.trim(),
      initials: normalizeInitials(formState.initials),
      email: formState.email.trim().toLowerCase(),
      role: formState.role,
      locationId: normalizeLocationId(formState.locationId),
      isActive: formState.isActive,
    };

    if (isEditing && formState.userId) {
      onUpdateUser({
        userId: formState.userId,
        displayName: payload.displayName,
        initials: payload.initials,
        role: payload.role,
        locationId: payload.locationId,
        isActive: payload.isActive,
      });
    } else {
      onCreateUser(payload);
    }

    resetForm();
  }

  return (
    <div style={{ display: "grid", gap: "16px", marginTop: "18px" }}>
      <div style={cardStyle}>
        <div
          style={{
            marginBottom: "14px",
            paddingBottom: "12px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
            Admin User Management
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
            Manage which Entra users are allowed into Action Desk. Adding a user creates an
            Action Desk record only. Microsoft identity mapping still happens on that person&apos;s
            first real sign-in.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "14px",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <div>
            <label htmlFor="admin-user-name" style={labelStyle}>
              Name
            </label>
            <input
              id="admin-user-name"
              type="text"
              value={formState.displayName}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="Jordan Kim"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="admin-user-initials" style={labelStyle}>
              Initials
            </label>
            <input
              id="admin-user-initials"
              type="text"
              value={formState.initials}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  initials: normalizeInitials(event.target.value),
                }))
              }
              placeholder="JK"
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="admin-user-email" style={labelStyle}>
              Email
            </label>
            <input
              id="admin-user-email"
              type="email"
              value={formState.email}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              disabled={isEditing}
              placeholder="jordan.kim@actiondesk.local"
              style={{
                ...inputStyle,
                backgroundColor: isEditing ? "#f8fafc" : "#ffffff",
                color: isEditing ? "#64748b" : "#0f172a",
              }}
            />
            {isEditing && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#64748b" }}>
                Email stays fixed after creation so Microsoft identity mapping remains predictable.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="admin-user-role" style={labelStyle}>
              Role
            </label>
            <select
              id="admin-user-role"
              value={formState.role}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  role: event.target.value as RepProfile["role"],
                }))
              }
              style={inputStyle}
            >
              <option value="rep">Rep</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label htmlFor="admin-user-location" style={labelStyle}>
              Location
            </label>
            <select
              id="admin-user-location"
              value={formState.locationId}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  locationId: event.target.value,
                }))
              }
              style={inputStyle}
            >
              {safeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "14px",
              color: "#334155",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={formState.isActive}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />
            Allow this user to sign in
          </label>
        </div>

        {showValidation && validationMessage && (
          <p style={{ margin: "14px 0 0", fontSize: "13px", color: "#b91c1c" }}>
            {validationMessage}
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
          <button type="button" onClick={handleSubmit} style={primaryButtonStyle}>
            {isEditing ? "Save User" : "Add User"}
          </button>
          {(isEditing || formState.displayName || formState.initials || formState.email) && (
            <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {sortedUsers.map((user) => (
          <div key={user.id} style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                    {user.displayName ?? user.name}
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                    {user.email} | {user.initials}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      ...getRoleBadgeStyle(user.role),
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {getRoleLabel(user.role)}
                  </span>
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      border: `1px solid ${user.isActive ? "#86efac" : "#fecaca"}`,
                      backgroundColor: user.isActive ? "#f0fdf4" : "#fef2f2",
                      color: user.isActive ? "#166534" : "#991b1b",
                    }}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      border: `1px solid ${user.mappingStatus === "mapped" ? "#93c5fd" : "#cbd5e1"}`,
                      backgroundColor: user.mappingStatus === "mapped" ? "#eff6ff" : "#f8fafc",
                      color: user.mappingStatus === "mapped" ? "#1d4ed8" : "#475569",
                    }}
                  >
                    {user.mappingStatus === "mapped" ? "Mapped" : "Pending first sign-in"}
                  </span>
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#f8fafc",
                      color: "#334155",
                    }}
                  >
                    {getLocationLabel(user.locationId)}
                  </span>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>
                    <strong>Entra mapping:</strong>{" "}
                    {user.entraObjectId ?? "Pending first sign-in"}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>
                    <strong>Sign-in state:</strong>{" "}
                    {user.hasSignedIn ? "Has signed in before" : "Waiting for first sign-in"}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>
                    <strong>Created:</strong> {formatTimestamp(user.createdAt)}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>
                    <strong>Updated:</strong> {formatTimestamp(user.updatedAt)}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleEdit(user)}
                  style={secondaryButtonStyle}
                >
                  Edit
                </button>
                {user.isActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Deactivate ${user.displayName ?? user.name}? They will no longer be able to sign in to Action Desk.`,
                        )
                      ) {
                        onDeactivateUser(user.id);
                      }
                    }}
                    style={{
                      ...secondaryButtonStyle,
                      borderColor: "#fecaca",
                      color: "#991b1b",
                      backgroundColor: "#fff7f7",
                    }}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateUser({
                        userId: user.id,
                        isActive: true,
                      })
                    }
                    style={secondaryButtonStyle}
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

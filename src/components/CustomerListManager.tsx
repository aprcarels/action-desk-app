import { useMemo, useState } from "react";
import type {
  CustomerCsrAssignment,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
} from "../types/actionDesk";
import {
  findConflictingCustomerDomain,
  getCustomerOwnerRepIds,
  getCustomerPrimaryOwnerId,
  getSavedCustomerDisplayName,
  isBlockedCustomerDomain,
  normalizeCustomerDomains,
  normalizeCustomerEmails,
  normalizeCustomerName,
} from "../services/customerSettings";
import {
  ACTION_DESK_LOCATIONS,
  canAccessLocation,
  getLocationLabel,
  normalizeLocationId,
} from "../services/locations";

type CustomerListManagerProps = {
  currentRep: RepProfile;
  reps: RepProfile[];
  customers: SavedCustomer[];
  canManage: boolean;
  onSaveCustomer: (draft: SavedCustomerDraft) => void;
  onDeleteCustomer: (customerId: string) => void;
  onClearAllCustomers: () => void;
};

type CustomerFormState = {
  id?: string;
  name: string;
  emailsText: string;
  domainsText: string;
  ownerRepId: string;
  ownerRepIds: string[];
  locationId: string;
};

const emptyFormState: CustomerFormState = {
  id: undefined,
  name: "",
  emailsText: "",
  domainsText: "",
  ownerRepId: "",
  ownerRepIds: [],
  locationId: "",
};

function parseEmails(emailsText: string): string[] {
  return normalizeCustomerEmails(emailsText.split("\n"));
}

function parseDomains(domainsText: string): string[] {
  return normalizeCustomerDomains(domainsText.split("\n"));
}

function getValidationMessage(
  name: string,
  emails: string[],
  domains: string[],
  customers: SavedCustomer[],
  editingCustomerId?: string,
): string | null {
  const normalizedName = normalizeCustomerName(name);

  if (normalizedName.length === 0 && emails.length === 0 && domains.length === 0) {
    return "Add a customer name, at least one email address, at least one company domain, or a combination before saving.";
  }

  const blockedDomain = domains.find((domain) => isBlockedCustomerDomain(domain));

  if (blockedDomain) {
    return `${blockedDomain} is blocked because public email domains are too broad for automatic customer ownership.`;
  }

  const conflictingDomain = findConflictingCustomerDomain(
    customers,
    domains,
    editingCustomerId,
  );

  if (conflictingDomain) {
    return `${conflictingDomain.domain} is already assigned to ${conflictingDomain.customerName}. Remove the duplicate domain before saving.`;
  }

  return null;
}

export function CustomerListManager({
  currentRep,
  reps,
  customers,
  canManage,
  onSaveCustomer,
  onDeleteCustomer,
  onClearAllCustomers,
}: CustomerListManagerProps) {
  const [formState, setFormState] = useState<CustomerFormState>(emptyFormState);
  const [showValidation, setShowValidation] = useState(false);

  const parsedEmails = useMemo(
    () => parseEmails(formState.emailsText),
    [formState.emailsText],
  );
  const parsedDomains = useMemo(
    () => parseDomains(formState.domainsText),
    [formState.domainsText],
  );
  const normalizedName = normalizeCustomerName(formState.name);
  const validationMessage = getValidationMessage(
    normalizedName,
    parsedEmails,
    parsedDomains,
    customers,
    formState.id,
  );
  const availableOwnerReps = reps.filter((rep) => rep.isActive !== false);
  const availableLocations =
    currentRep.role === "admin"
      ? ACTION_DESK_LOCATIONS
      : ACTION_DESK_LOCATIONS.filter((location) => location.id === currentRep.locationId);
  const visibleCustomers = customers.filter((customer) =>
    canAccessLocation(currentRep, customer.locationId),
  );
  const isValid = validationMessage === null;
  const ownerLocationId = formState.locationId || currentRep.locationId;
  const visibleOwnerReps = availableOwnerReps.filter((rep) =>
    currentRep.role === "admin" ? true : rep.locationId === currentRep.locationId,
  );
  const locationScopedOwnerReps = visibleOwnerReps.filter((rep) =>
    ownerLocationId ? rep.locationId === ownerLocationId : true,
  );

  function resetForm() {
    setFormState(emptyFormState);
    setShowValidation(false);
  }

  function getSelectedOwnerIds(): string[] {
    return Array.from(
      new Set(
        [formState.ownerRepId, ...formState.ownerRepIds].filter(
          (repId) => repId.trim().length > 0,
        ),
      ),
    );
  }

  function buildAssignedCsrs(): CustomerCsrAssignment[] {
    const selectedOwnerIds = getSelectedOwnerIds();
    const primaryOwnerId = formState.ownerRepId || selectedOwnerIds[0];

    return selectedOwnerIds.map((repId) => ({
      repId,
      assignmentRole: repId === primaryOwnerId ? "primary" : "secondary",
      isActive: true,
    }));
  }

  function toggleAdditionalOwner(repId: string) {
    setFormState((current) => {
      const isSelected = current.ownerRepIds.includes(repId);

      return {
        ...current,
        ownerRepIds: isSelected
          ? current.ownerRepIds.filter((selectedRepId) => selectedRepId !== repId)
          : [...current.ownerRepIds, repId],
      };
    });
  }

  function handleSubmit() {
    setShowValidation(true);

    if (!isValid) {
      return;
    }

    onSaveCustomer({
      id: formState.id,
      name: normalizedName,
      emails: parsedEmails,
      domains: parsedDomains,
      ownerRepId: formState.ownerRepId || undefined,
      ownerRepIds: getSelectedOwnerIds(),
      assignedCSRs: buildAssignedCsrs(),
      locationId: normalizeLocationId(formState.locationId) ?? currentRep.locationId,
    });
    resetForm();
  }

  function handleEdit(customer: SavedCustomer) {
    const primaryOwnerRepId = getCustomerPrimaryOwnerId(customer) ?? "";
    const ownerRepIds = getCustomerOwnerRepIds(customer).filter(
      (repId) => repId !== primaryOwnerRepId,
    );

    setFormState({
      id: customer.id,
      name: customer.name,
      emailsText: customer.emails.join("\n"),
      domainsText: customer.domains.join("\n"),
      ownerRepId: primaryOwnerRepId,
      ownerRepIds,
      locationId: customer.locationId ?? currentRep.locationId ?? "",
    });
    setShowValidation(false);
  }

  const cardStyle: React.CSSProperties = {
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
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={cardStyle}>
        <div
          style={{
            marginBottom: "14px",
            paddingBottom: "12px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
            Customer Ownership
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#334155" }}>
            {canManage
              ? "Supervisors and admins manage customer ownership. Matching exact emails and company domains auto-assign to the selected rep."
              : `You can view the customers currently assigned to ${currentRep.name}. Ownership changes are managed by supervisors or admins.`}
          </p>
        </div>

        {canManage ? (
          <div style={{ display: "grid", gap: "14px" }}>
            <div>
              <label style={fieldLabelStyle} htmlFor="customer-name">
                Customer Name
              </label>
              <input
                id="customer-name"
                type="text"
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Acme"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={fieldLabelStyle} htmlFor="customer-owner">
                Primary CSR
              </label>
              <select
                id="customer-owner"
                value={formState.ownerRepId}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    ownerRepId: event.target.value,
                    ownerRepIds: current.ownerRepIds.filter(
                      (repId) => repId !== event.target.value,
                    ),
                  }))
                }
                style={inputStyle}
              >
                <option value="">Unassigned</option>
                {locationScopedOwnerReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} ({rep.role === "admin" ? "Admin" : rep.role === "supervisor" ? "Supervisor" : "Rep"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p style={fieldLabelStyle}>Additional CSRs</p>
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                {locationScopedOwnerReps.filter((rep) => rep.id !== formState.ownerRepId).length === 0 ? (
                  <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                    No additional active CSRs are available for this location.
                  </span>
                ) : (
                  locationScopedOwnerReps
                    .filter((rep) => rep.id !== formState.ownerRepId)
                    .map((rep) => (
                      <label
                        key={rep.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "13px",
                          color: "#334155",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formState.ownerRepIds.includes(rep.id)}
                          onChange={() => toggleAdditionalOwner(rep.id)}
                        />
                        {rep.name} ({rep.role === "admin" ? "Admin" : rep.role === "supervisor" ? "Supervisor" : "Rep"})
                      </label>
                    ))
                )}
              </div>
            </div>

            <div>
              <label style={fieldLabelStyle} htmlFor="customer-location">
                Location
              </label>
              <select
                id="customer-location"
                value={formState.locationId || currentRep.locationId || ""}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                {!currentRep.locationId && <option value="">Unassigned</option>}
                {availableLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={fieldLabelStyle} htmlFor="customer-emails">
                Email Addresses
              </label>
              <textarea
                id="customer-emails"
                value={formState.emailsText}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    emailsText: event.target.value,
                  }))
                }
                rows={5}
                placeholder={"buyer@acme.com\nsupport@acme.com"}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "110px",
                  fontFamily: "inherit",
                }}
              />
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#64748b" }}>
                Enter one email per line. Emails are saved in lowercase, blank lines are ignored, duplicate emails inside one customer are removed, and the first saved customer wins if the same email appears on multiple customers.
              </p>
            </div>

            <div>
              <label style={fieldLabelStyle} htmlFor="customer-domains">
                Company Domains
              </label>
              <textarea
                id="customer-domains"
                value={formState.domainsText}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    domainsText: event.target.value,
                  }))
                }
                rows={4}
                placeholder={"acme.com\nacme.co.uk"}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "96px",
                  fontFamily: "inherit",
                }}
              />
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#64748b" }}>
                Enter one domain per line. Domains are normalized to lowercase, duplicate domains inside one customer are removed, public mailbox domains like gmail.com are blocked, and domains cannot be reused across customers.
              </p>
            </div>

            {showValidation && validationMessage && (
              <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c" }}>
                {validationMessage}
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={handleSubmit} style={primaryButtonStyle}>
                {formState.id ? "Save Customer" : "Add Customer"}
              </button>
              {(
                formState.id ||
                formState.name ||
                formState.emailsText ||
                formState.domainsText ||
                formState.ownerRepId ||
                formState.ownerRepIds.length > 0 ||
                formState.locationId
              ) && (
                <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
                  Cancel
                </button>
              )}
              {customers.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllCustomers}
                  style={{
                    ...secondaryButtonStyle,
                    borderColor: "#fecaca",
                    color: "#991b1b",
                    backgroundColor: "#fff7f7",
                  }}
                >
                  Clear All Customers
                </button>
              )}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: 1.6 }}>
            Ownership is read-only for reps. If one of these assignments is wrong, contact a supervisor or admin.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {visibleCustomers.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ margin: 0, fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
              {canManage
                ? "No customers have been assigned yet. Add customers here with exact emails, company domains, and an owner for automatic routing."
                : "No customers are currently assigned to you."}
            </p>
          </div>
        ) : (
          visibleCustomers.map((customer) => {
            const ownerRepIds = getCustomerOwnerRepIds(customer);
            const primaryOwnerRepId = getCustomerPrimaryOwnerId(customer);
            const owners = ownerRepIds.map((repId) => ({
              assignment: customer.assignedCSRs?.find(
                (assignedCsr) => assignedCsr.repId === repId,
              ),
              rep: reps.find((rep) => rep.id === repId),
              repId,
            }));

            return (
              <div key={customer.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#0f172a" }}>
                      {getSavedCustomerDisplayName(customer)}
                    </h3>
                    <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#334155" }}>
                      Assigned CSRs:{" "}
                      {owners.length > 0
                        ? owners
                            .map(({ assignment, rep, repId }) => {
                              const role =
                                assignment?.assignmentRole ??
                                (repId === primaryOwnerRepId ? "primary" : "secondary");

                              return `${rep ? rep.name : "Unknown Rep"} (${role})`;
                            })
                            .join(", ")
                        : "Unassigned"}
                    </p>
                    <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#334155" }}>
                      Location: {getLocationLabel(customer.locationId)}
                    </p>
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div>
                        <p
                          style={{
                            margin: "0 0 4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Email Addresses
                        </p>
                        {customer.emails.length > 0 ? (
                          <div style={{ display: "grid", gap: "4px" }}>
                            {customer.emails.map((email) => (
                              <span key={email} style={{ fontSize: "13px", color: "#475569" }}>
                                {email}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                            No exact email addresses saved
                          </span>
                        )}
                      </div>

                      <div>
                        <p
                          style={{
                            margin: "0 0 4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Company Domains
                        </p>
                        {customer.domains.length > 0 ? (
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {customer.domains.map((domain) => (
                              <span
                                key={domain}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  backgroundColor: "#eef2ff",
                                  color: "#3730a3",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                {domain}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                            No company domains saved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canManage && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(customer)}
                        style={secondaryButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (formState.id === customer.id) {
                            resetForm();
                          }

                          onDeleteCustomer(customer.id);
                        }}
                        style={{
                          ...secondaryButtonStyle,
                          borderColor: "#fecaca",
                          color: "#991b1b",
                          backgroundColor: "#fff7f7",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

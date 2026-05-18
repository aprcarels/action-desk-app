function normalizeRole(value) {
  if (value === "admin" || value === "supervisor") {
    return value;
  }

  return "rep";
}

function getCapabilitiesForRole(role) {
  if (role === "admin") {
    return [
      "view_my_queue",
      "view_unassigned",
      "view_all_emails",
      "view_supervisor_queue",
      "view_all_work",
      "manage_customer_ownership",
      "manage_sla_settings",
      "review_override_history",
      "view_diagnostics",
      "create_backup",
      "manage_users",
      "manage_test_queue_data",
    ];
  }

  if (role === "supervisor") {
    return [
      "view_my_queue",
      "view_unassigned",
      "view_all_emails",
      "view_supervisor_queue",
      "manage_customer_ownership",
      "manage_sla_settings",
      "review_override_history",
    ];
  }

  return [
    "view_my_queue",
    "view_unassigned",
    "review_override_history",
  ];
}

function resolveMappedUser(users, identity) {
  const entraObjectId = String(identity?.entraObjectId || "").trim();
  const email = String(identity?.email || "").trim().toLowerCase();

  if (!entraObjectId || !email) {
    return null;
  }

  const byObjectId = users.find(
    (user) => String(user.entra_object_id || "").trim() === entraObjectId,
  );

  if (byObjectId) {
    return byObjectId.is_active === 1 ? byObjectId : null;
  }

  const byEmail = users.find(
    (user) => String(user.email || "").trim().toLowerCase() === email,
  );

  return byEmail && byEmail.is_active === 1 ? byEmail : null;
}

function buildSessionSummary(sessionId, currentUser, reps) {
  return {
    sessionId: String(sessionId || "").trim(),
    currentUser,
    capabilities: currentUser ? getCapabilitiesForRole(currentUser.role) : [],
    reps,
  };
}

module.exports = {
  buildSessionSummary,
  getCapabilitiesForRole,
  normalizeRole,
  resolveMappedUser,
};

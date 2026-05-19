import { getEnv } from "../utils/env";

function getApiUrl() {
  const apiUrl = (
    getEnv("ACTION_DESK_API_URL") ??
    getEnv("VITE_ACTION_DESK_API_URL") ??
    ""
  ).replace(/\/+$/, "");

  if (!apiUrl) {
    throw new Error("ACTION_DESK_API_URL or VITE_ACTION_DESK_API_URL is not configured.");
  }

  return apiUrl;
}

export async function getUsers() {
  const res = await fetch(`${getApiUrl()}/api/users`);
  return res.json();
}

export async function getCustomers() {
  const res = await fetch(`${getApiUrl()}/api/customers`);
  return res.json();
}

export async function getAssignments() {
  const res = await fetch(`${getApiUrl()}/api/customer-assignments`);
  return res.json();
}

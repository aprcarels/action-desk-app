const DEFAULT_ACTION_DESK_ORIGIN = "http://192.168.15.177:4000";

const origin =
  String(process.env.ACTION_DESK_API_URL || "").trim() ||
  String(process.env.VITE_ACTION_DESK_API_URL || "").trim() ||
  String(process.env.ACTION_DESK_API_ORIGIN || "").trim() ||
  DEFAULT_ACTION_DESK_ORIGIN;
const endpoint = new URL("/api/ai/classify-email", origin);

const vendorEmail = {
  subject: "RE: AP Express Logistics priorities",
  from: "Casey Morgan, Technical Sales Manager <casey@duagon.example>",
  body: [
    "Hi AP Express team,",
    "",
    "Duagon builds made in America hardware for railroad environments where durability matters.",
    "Would you be open to a quick chat to see whether this fits your 2026 logistics priorities?",
    "",
    "Casey Morgan",
    "Technical Sales Manager",
  ].join("\n"),
};

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("This smoke test requires a Node runtime with global fetch.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(vendorEmail),
  });
  const payload = await response.json().catch(() => ({}));

  console.log("Action Desk AI endpoint:", endpoint.toString());
  console.log("HTTP status:", response.status, response.statusText);
  console.log("AI result:", JSON.stringify(payload, null, 2));

  if (!response.ok) {
    process.exitCode = 1;
    return;
  }

  if (payload.aiSource !== "ollama") {
    throw new Error("Expected aiSource to be 'ollama'.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

# Ollama AI Classification

Phase 1 AI support is classification and summarization only. The Action Desk rules engine remains authoritative for priority, workflow state, assignments, permissions, reply generation, and persistence.

When Ollama is available, Action Desk calls Qwen through Ollama and stores the result as an assistive `aiClassification`. When Ollama is offline, disabled, times out, or returns invalid JSON, Action Desk falls back to rules-based analysis and logs the reason.

The central backend route is:

```text
POST ${ACTION_DESK_API_URL}/api/ai/classify-email
```

For the current pilot backend, that is:

```text
POST http://192.168.15.177:4000/api/ai/classify-email
```

Input:

```json
{
  "subject": "Shipment status for ORD-1002",
  "from": "customer@example.com",
  "body": "Can you send the current shipment status?"
}
```

Successful Ollama output:

```json
{
  "category": "order/shipment issue",
  "actionable": true,
  "urgency": "medium",
  "summary": "Customer is asking for current shipment status.",
  "confidence": 0.88,
  "aiSource": "ollama"
}
```

## Install Ollama

Use the official Ollama download page for Windows, macOS, or Linux:

```text
https://ollama.com/download
```

On the backend server, confirm the service is available:

```bash
ollama serve
```

Ollama's CLI docs also list `ollama serve`, `ollama pull`, `ollama run`, and `ollama ls` for managing local models.

## Pull Qwen

Pull the recommended model on the backend server:

```bash
ollama pull qwen2.5:3b
```

Optional smoke test:

```bash
ollama run qwen2.5:3b "Return JSON: {\"ok\": true}"
```

Direct HTTP smoke test against Ollama:

```bash
curl http://127.0.0.1:11434/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"qwen2.5:3b\",\"prompt\":\"Return JSON only: {\\\"category\\\":\\\"vendor sales outreach\\\",\\\"actionable\\\":false,\\\"urgency\\\":\\\"low\\\",\\\"summary\\\":\\\"Vendor pitch.\\\",\\\"confidence\\\":0.9}\",\"stream\":false,\"format\":\"json\"}"
```

The Ollama model page for `qwen2.5:3b` lists the same model tag and shows it as a 3.09B-parameter Qwen2 model.

## Configure Action Desk

Local `.env`:

```bash
ACTION_DESK_API_URL=http://192.168.15.177:4000
ACTION_DESK_AI_ENABLED=true
VITE_AI_CLASSIFICATION_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT_MS=4000
```

Packaged desktop runtime config may also include:

```json
{
  "ACTION_DESK_AI_ENABLED": "true",
  "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
  "OLLAMA_MODEL": "qwen2.5:3b",
  "OLLAMA_TIMEOUT_MS": "4000"
}
```

## Disable AI

Disable backend AI calls:

```bash
ACTION_DESK_AI_ENABLED=false
```

Disable frontend requests to the AI route:

```bash
VITE_AI_CLASSIFICATION_ENABLED=false
```

When Ollama is offline, times out, returns invalid JSON, or AI is disabled, Action Desk falls back to the current rules-based analysis. The queue, recommendations, reply drafts, and workflow controls continue to function.

## Test Action Desk Endpoint

Start the desktop app server, then call the Action Desk endpoint:

```bash
npm run smoke:ai
```

The script posts a Duagon-style vendor outreach email to:

```text
POST ${ACTION_DESK_API_URL}/api/ai/classify-email
```

You can also call it manually:

```bash
curl http://192.168.15.177:4000/api/ai/classify-email \
  -H "Content-Type: application/json" \
  -d "{\"subject\":\"RE: AP Express Logistics priorities\",\"from\":\"Casey Morgan, Technical Sales Manager <casey@duagon.example>\",\"body\":\"Duagon builds made in America hardware for railroad environments. Would AP Express be open to a quick chat?\"}"
```

Expected vendor result:

```json
{
  "category": "vendor sales outreach",
  "actionable": false,
  "urgency": "low",
  "confidence": 0.8,
  "aiSource": "ollama"
}
```

Expected internal EOD result:

```json
{
  "category": "internal operational update",
  "actionable": false,
  "urgency": "low",
  "aiSource": "ollama"
}
```

Expected customer order result:

```json
{
  "category": "order/shipment issue",
  "actionable": true,
  "urgency": "medium",
  "aiSource": "ollama"
}
```

Confidence can vary by model run, but vendor outreach and internal EOD reports should not be treated as customer support, should not request an order number, and should not produce a customer-service reply draft. Legitimate customer order or delayed-shipment requests should remain actionable.

## Confirm Diagnostics

Successful backend calls log entries like:

```text
[INFO] [ai] ollamaClassificationRequestStarted {"provider":"ollama","model":"qwen2.5:3b","endpoint":"http://127.0.0.1:11434/api/generate"}
[INFO] [ai] ollamaClassificationResponseStatus {"status":200,"ok":true}
[INFO] [ai] ollamaClassificationParsed {"category":"vendor sales outreach","actionable":false,"confidence":0.92,"aiSource":"ollama"}
```

Fallback logs include the reason:

```text
[WARN] [ai] AI classification route failed. {"code":"ai_unavailable","fallbackReason":"ai_unavailable"}
[Action Desk AI diagnostics] aiUnavailableFallback {"reason":"ai_route_unavailable"}
```

To confirm fallback behavior, stop Ollama or set:

```bash
ACTION_DESK_AI_ENABLED=false
```

Then reload or process an email. The UI should continue to show rules-based triage. The AI Assisted card will be omitted when no valid Ollama result is available.

## Guardrails

The AI route only classifies a supplied email body. It must not send emails, update workflow state, assign tickets, override permissions, or modify database records.

The UI labels AI output as "AI Assisted" and shows confidence. This label means assistive context only; Action Desk rules remain authoritative.

## References

- Ollama docs: https://docs.ollama.com/
- Ollama CLI reference: https://docs.ollama.com/cli
- qwen2.5:3b model page: https://registry.ollama.ai/library/qwen2.5:3b

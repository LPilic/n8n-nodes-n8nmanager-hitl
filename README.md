# n8n-nodes-n8nmanager-hitl

An n8n community node package for **Human-in-the-Loop (HITL) approvals** powered by [n8n-library](https://github.com/LPilic/n8n-library). Replaces manual HTTP Request + Wait for Webhook wiring with drag-and-drop nodes.

## Nodes

### HITL Approval (Action Node)

Sends data to n8n-library for human review and **pauses the workflow** until a reviewer approves or rejects.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Template | dropdown | yes | HITL template (dynamically loaded from n8n-library) |
| Title | string | no | Request title shown to the reviewer |
| Description | string | no | Context for the reviewer |
| Priority | select | no | `low`, `medium`, `high`, `critical` (default: `medium`) |
| Timeout (Minutes) | number | no | Auto-expire timeout (default: 1440 = 24h) |
| Data | JSON | yes | Data to display in the approval form (use expressions to map input) |
| Assign To | string | no | User ID to assign the review to |

**How it works:**

1. Node sends a POST to n8n-library's HITL webhook endpoint with the form data and a callback URL
2. The workflow execution pauses (enters waiting state)
3. A human reviews the request in n8n-library and clicks Approve or Reject
4. n8n-library calls back to n8n's webhook-waiting endpoint
5. The workflow resumes with the decision payload

**Output:**

```json
{
  "request_id": 42,
  "action": "approve",
  "status": "approved",
  "responded_by": "admin",
  "form_data": {
    "notes": "Looks good",
    "revised_amount": 11000
  },
  "comment": "Approved with minor edits",
  "timestamp": "2026-03-17T15:30:00.000Z"
}
```

### HITL Trigger (Polling Trigger Node)

Polls n8n-library for new HITL approval decisions and triggers a workflow when one is found. Useful for audit logging, notifications, or post-processing workflows that don't need to wait inline.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| Template Filter | dropdown | Trigger for a specific template or all templates |
| Action Filter | select | `All`, `Approved`, or `Rejected` |

**Use cases:**
- Audit logging of all approval decisions
- Slack/Teams notifications when approvals happen
- Post-processing workflows triggered by approvals

## Credentials

### HITL Approval API

| Field | Description |
|-------|-------------|
| Instance URL | Base URL of your n8n-library instance (e.g. `http://n8n-library:3100`) |
| API Key | API key from n8n-library **Settings > API Keys** (`n8nlib_xxx`) |

The credential test verifies connectivity by calling `GET /api/hitl/templates`.

## Installation

### Docker (custom-nodes volume mount)

If you run n8n in Docker with a `custom-nodes` volume mount:

1. Clone this repo into your custom-nodes directory:
   ```bash
   cd /path/to/custom-nodes
   git clone https://github.com/LPilic/n8n-nodes-n8nmanager-hitl.git
   ```

2. Install dependencies and build:
   ```bash
   cd n8n-nodes-n8nmanager-hitl
   npm install --ignore-scripts
   npm run build
   ```

3. Install into n8n's node_modules (inside the container):
   ```bash
   docker exec <n8n-container> sh -c "cd /home/node/.n8n && npm install /home/node/.n8n/custom-nodes/n8n-nodes-n8nmanager-hitl --ignore-scripts"
   ```

4. Add the `N8N_CUSTOM_EXTENSIONS` environment variable to your n8n service:
   ```yaml
   environment:
     N8N_CUSTOM_EXTENSIONS: /home/node/.n8n/custom-nodes/n8n-nodes-n8nmanager-hitl
   ```

5. Restart n8n.

### Development

```bash
npm install --ignore-scripts
npm run dev    # Watch mode — recompiles on changes
```

After changes, reinstall in the container and restart n8n:

```bash
docker exec <n8n-container> sh -c "cd /home/node/.n8n && npm install /home/node/.n8n/custom-nodes/n8n-nodes-n8nmanager-hitl --ignore-scripts"
docker compose restart n8n-web n8n-worker
```

## n8n-library API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/hitl/templates` | List templates (for dropdown + credential test) |
| POST | `/api/hitl/webhook/:slug` | Create approval request |
| GET | `/api/hitl/requests` | Poll for decisions (trigger node) |

## Example Workflow

```
[Trigger: New Invoice]
    -> [Extract Data]
    -> [HITL Approval: "invoice-approval"]
    -> [IF: action == "approve"]
        -> Yes: [Process Payment]
        -> No:  [Send Rejection Email]
```

The HITL Approval node pauses the workflow. The finance team reviews the invoice in n8n-library with all the extracted data displayed in a custom form. They approve or reject, optionally editing amounts or adding notes. The workflow resumes with their decision and form data.

## Project Structure

```
n8n-nodes-n8nmanager-hitl/
├── package.json
├── tsconfig.json
├── credentials/
│   └── HitlApi.credentials.ts        # API key + instance URL credential
├── nodes/
│   ├── HitlApproval/
│   │   └── HitlApproval.node.ts       # Action node (send + wait for decision)
│   └── HitlTrigger/
│       └── HitlTrigger.node.ts        # Polling trigger node
└── dist/                              # Compiled JavaScript
```

## Requirements

- n8n 1.0+ (self-hosted)
- [n8n-library](https://github.com/LPilic/n8n-library) with HITL templates configured

## License

MIT

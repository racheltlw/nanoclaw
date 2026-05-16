# WhatsApp Contact Whitelist & Shared Memory

## Overview

Only explicitly whitelisted contacts can reach the agent via WhatsApp. Messages from unknown senders are silently dropped before any DB write or routing occurs. Whitelisted contacts each get their own isolated session, container, and memory store, while org-level facts are automatically promoted to a shared global memory.

## Whitelist model

The `contacts` table in the central DB (`data/v2.db`) is the whitelist.

| Column | Description |
|--------|-------------|
| `phone_e164` | E.164 phone number (+6591234567). Primary lookup key. |
| `lid` | WhatsApp LID (linked-identity ID). Fallback for users with privacy settings that hide their phone JID. |
| `display_name` | Human-readable name injected into the agent's system context. |
| `team` | Optional free-text team/group label. Shown alongside name. |
| `status` | `active` (routes messages) or `paused` (drops silently, history preserved). |

### JID normalisation

- Phone JIDs (`6591234567@s.whatsapp.net`) → `+6591234567`
- LID JIDs (`123456789@lid`) → matched via `lid` column
- Group JIDs (`@g.us`) → look up the **participant** JID, not the group JID

## Routing

**1:1 chats**: Always trigger the agent. Each contact's DM maps to its own messaging_group and session. The session persists across container restarts.

**Group chats**: Only trigger on @-mention of the trigger word (existing engage_mode='mention' / 'pattern' behaviour). The group's messaging_group must be explicitly wired to an agent group. Per-contact whitelist check runs on the **participant** JID inside the group.

## Memory model

Each contact session has two mnemon stores:

| Store | Path (host) | Container path | Purpose |
|-------|-------------|----------------|---------|
| Local | `groups/<folder>/contacts/<contact_id>/mnemon.db` | `/workspace/agent/contacts/<id>/mnemon.db` | Personal facts about this contact |
| Global | `groups/<folder>/mnemon.db` | `/workspace/agent/mnemon.db` | Org-level facts shared across all contact sessions |

### Env vars set per contact session

| Variable | Value |
|----------|-------|
| `MNEMON_DB` | Per-contact local DB path |
| `GLOBAL_MNEMON_DB` | Agent-group global DB path |
| `CONTACT_DISPLAY_NAME` | Contact's display name |
| `CONTACT_TEAM` | Contact's team (optional) |
| `CONTACT_ID` | Contact's DB id |

### Fact promotion

After each agent turn, the poll-loop runs a lightweight extraction pass:

1. Split response into sentences (≥ 30 chars).
2. **Org signal**: contains keywords like `project`, `team`, `decision`, `deadline`, etc. → promoted to **global** mnemon with provenance (`source_contact_id`, `promoted_to_global_at`).
3. **Personal signal**: contains `I/me/my/you/your` → written to **local** mnemon only.
4. **Ambiguous**: skipped without a classifier call.

## Owner commands

Issue these from the owner's main group (the session wired to the primary agent group). They are silently ignored from other chats.

| Command | Effect |
|---------|--------|
| `add contact +<phone> "<name>" [team: <team>]` | Insert into contacts, auto-wire DM routing |
| `list contacts` | Reply with table of contacts and status |
| `pause contact <name or phone>` | Set status=paused |
| `resume contact <name or phone>` | Set status=active |
| `remove contact <name or phone>` | Set status=paused (soft-delete, history preserved) |

The agent uses the `manage_contacts` MCP tool to queue these as system actions. The host delivery layer applies them to the central DB.

## Nightly synthesis

The agent can schedule a nightly task to:

1. Recompile relevant wiki pages from new mnemon entries.
2. Deduplicate near-identical entries in the global store (embedding similarity via `mnemon query`).
3. Flag contradictions and DM the owner with a short review list.

To set this up, ask the agent: *"Schedule a nightly synthesis of the global memory store."*

## Self-report

Ask the agent *"what do you know about me?"* and it will query its local mnemon and format the results. To ask about an org-level topic or a named colleague, ask *"what do you know about [name/topic]?"* — this queries the global store.

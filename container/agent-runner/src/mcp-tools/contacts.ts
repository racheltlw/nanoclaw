/**
 * Contacts management MCP tool.
 *
 * Writes a system action to messages_out that the host delivery layer
 * picks up and applies to the central contacts table. Only usable from
 * the owner's main group — the host handler validates this.
 *
 * Actions: add | list | pause | resume | remove
 */
import { getSessionRouting } from '../db/session-routing.js';
import { writeMessageOut } from '../db/messages-out.js';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const manageContacts: McpToolDefinition = {
  tool: {
    name: 'manage_contacts',
    description:
      'Add, list, pause, resume, or remove whitelisted WhatsApp contacts. Only works from the owner\'s main group.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'list', 'pause', 'resume', 'remove'],
          description: 'Operation to perform',
        },
        phone: {
          type: 'string',
          description: 'E.164 phone number (e.g. +6591234567) — required for add',
        },
        name: {
          type: 'string',
          description: 'Display name — required for add',
        },
        team: {
          type: 'string',
          description: 'Team or group label (optional, for add)',
        },
        identifier: {
          type: 'string',
          description: 'Phone number or display name — required for pause/resume/remove',
        },
      },
      required: ['action'],
    },
  },
  async handler(args) {
    const action = args.action as string;

    if (action === 'add') {
      if (!args.phone) return err('phone is required for add');
      if (!args.name) return err('name is required for add');
    } else if (['pause', 'resume', 'remove'].includes(action)) {
      if (!args.identifier) return err('identifier is required for pause/resume/remove');
    }

    const routing = getSessionRouting();
    const id = generateId();

    writeMessageOut({
      id,
      kind: 'system',
      platform_id: routing.platform_id,
      channel_type: routing.channel_type,
      thread_id: routing.thread_id,
      content: JSON.stringify({
        action: 'contacts_action',
        operation: action,
        phone: args.phone ?? null,
        name: args.name ?? null,
        team: args.team ?? null,
        identifier: args.identifier ?? null,
        reply_channel_type: routing.channel_type,
        reply_platform_id: routing.platform_id,
        reply_thread_id: routing.thread_id,
      }),
    });

    return ok(`Contact action '${action}' queued — host will confirm momentarily.`);
  },
};

registerTools([manageContacts]);

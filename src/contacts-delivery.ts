/**
 * Host-side delivery action handler for contacts management.
 *
 * The container agent writes `kind='system', action='contacts_action'` to
 * messages_out. This module registers the handler that applies the change to
 * the central contacts table and sends a confirmation reply.
 *
 * The handler only executes when invoked from a session whose messaging group
 * is NOT a per-contact WhatsApp DM — i.e. the owner's main group. Contact
 * sessions themselves are per-contact DMs and would never issue management
 * commands under normal operation.
 */
import type Database from 'better-sqlite3';

import { registerDeliveryAction, getDeliveryAdapter } from './delivery.js';
import { addContact, listContacts, findContactByPhoneOrName, setContactStatus } from './db/contacts.js';
import { discoverLidsForPhones } from './channels/whatsapp.js';
import {
  createMessagingGroup,
  getMessagingGroupByPlatform,
  getMessagingGroupAgentByPair,
  createMessagingGroupAgent,
} from './db/messaging-groups.js';
import { log } from './log.js';
import type { Session } from './types.js';

function generateId(): string {
  return `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMgaId(): string {
  return `mga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function reply(
  channelType: string | null | undefined,
  platformId: string | null | undefined,
  threadId: string | null | undefined,
  text: string,
): Promise<void> {
  const adapter = getDeliveryAdapter();
  if (!adapter || !channelType || !platformId) return;
  await adapter.deliver(channelType, platformId, threadId ?? null, 'chat', JSON.stringify({ text }));
}

registerDeliveryAction(
  'contacts_action',
  async (content: Record<string, unknown>, session: Session, _inDb: Database.Database) => {
    const operation = content.operation as string;
    const replyChannel = content.reply_channel_type as string | null;
    const replyPlatform = content.reply_platform_id as string | null;
    const replyThread = content.reply_thread_id as string | null;

    log.info('Contacts action', { sessionId: session.id, operation });

    try {
      if (operation === 'add') {
        const phone = (content.phone as string | null)?.trim();
        const name = (content.name as string | null)?.trim();
        const team = (content.team as string | null)?.trim() || undefined;

        if (!phone || !name) {
          await reply(replyChannel, replyPlatform, replyThread, 'Missing phone or name for add.');
          return;
        }
        if (!/^\+\d{7,15}$/.test(phone)) {
          await reply(replyChannel, replyPlatform, replyThread, `Invalid phone format. Use E.164, e.g. +6591234567.`);
          return;
        }

        const contact = addContact(phone, name, team, session.agent_group_id);

        // Ensure a messaging_group + wiring exists for this contact's DM so
        // first-message routing works without approval.
        const jid = `${phone.slice(1)}@s.whatsapp.net`;
        let mg = getMessagingGroupByPlatform('whatsapp', jid);
        if (!mg) {
          mg = {
            id: generateId(),
            channel_type: 'whatsapp',
            platform_id: jid,
            name,
            is_group: 0,
            unknown_sender_policy: 'public',
            denied_at: null,
            created_at: new Date().toISOString(),
          };
          createMessagingGroup(mg);
          log.info('Auto-created messaging group for contact', { contactId: contact.id, jid });
        }

        const existing = getMessagingGroupAgentByPair(mg.id, session.agent_group_id);
        if (!existing) {
          createMessagingGroupAgent({
            id: generateMgaId(),
            messaging_group_id: mg.id,
            agent_group_id: session.agent_group_id,
            engage_mode: 'pattern',
            engage_pattern: '@naig-bot',
            sender_scope: 'all',
            ignored_message_policy: 'drop',
            session_mode: 'shared',
            priority: 0,
            created_at: new Date().toISOString(),
          });
          log.info('Wired contact messaging group to agent', {
            contactId: contact.id,
            agentGroupId: session.agent_group_id,
          });
        }

        // Kick off LID discovery so the first message doesn't need manual setup
        void discoverLidsForPhones([phone]);

        const label = team ? `${name} (${team})` : name;
        await reply(replyChannel, replyPlatform, replyThread, `✓ Added contact: ${label} · ${phone}`);
      } else if (operation === 'list') {
        const contacts = listContacts();
        if (contacts.length === 0) {
          await reply(replyChannel, replyPlatform, replyThread, 'No contacts in whitelist yet.');
          return;
        }
        const lines = contacts.map((c) => {
          const team = c.team ? ` (${c.team})` : '';
          const status = c.status === 'paused' ? ' [paused]' : '';
          return `• ${c.display_name}${team}${status} — ${c.phone_e164}`;
        });
        await reply(replyChannel, replyPlatform, replyThread, `Contacts:\n${lines.join('\n')}`);
      } else if (operation === 'pause' || operation === 'resume') {
        const identifier = (content.identifier as string | null)?.trim();
        if (!identifier) {
          await reply(replyChannel, replyPlatform, replyThread, 'identifier is required.');
          return;
        }
        const contact = findContactByPhoneOrName(identifier);
        if (!contact) {
          await reply(replyChannel, replyPlatform, replyThread, `Contact not found: ${identifier}`);
          return;
        }
        const newStatus = operation === 'pause' ? 'paused' : 'active';
        setContactStatus(contact.id, newStatus);
        await reply(
          replyChannel,
          replyPlatform,
          replyThread,
          `${operation === 'pause' ? 'Paused' : 'Resumed'}: ${contact.display_name} (${contact.phone_e164})`,
        );
      } else if (operation === 'remove') {
        const identifier = (content.identifier as string | null)?.trim();
        if (!identifier) {
          await reply(replyChannel, replyPlatform, replyThread, 'identifier is required.');
          return;
        }
        const contact = findContactByPhoneOrName(identifier);
        if (!contact) {
          await reply(replyChannel, replyPlatform, replyThread, `Contact not found: ${identifier}`);
          return;
        }
        setContactStatus(contact.id, 'paused');
        await reply(
          replyChannel,
          replyPlatform,
          replyThread,
          `Removed (paused) contact: ${contact.display_name} — history preserved.`,
        );
      } else {
        log.warn('Unknown contacts_action operation', { operation });
      }
    } catch (err) {
      log.error('contacts_action handler error', { operation, err });
      await reply(
        replyChannel,
        replyPlatform,
        replyThread,
        `Error processing ${operation}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
);

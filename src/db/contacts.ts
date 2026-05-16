/**
 * Contacts table — the WhatsApp inbound whitelist.
 *
 * Each entry is a person whose WhatsApp messages are allowed to reach
 * the agent. Non-whitelisted senders are silently dropped at the adapter.
 * Status 'paused' is a soft-disable: the row is kept (preserving history
 * and session continuity) but messages are dropped as if not whitelisted.
 *
 * JID lookup:
 *   - Phone JIDs   (6591234567@s.whatsapp.net) → normalise to E.164 → match phone_e164
 *   - LID JIDs     (123456789@lid)             → extract user part → match lid
 *   - Group JIDs   (120363XXX@g.us)            → extract participant JID before calling
 */
import { getDb } from './connection.js';

export interface Contact {
  id: string;
  phone_e164: string;
  lid: string | null;
  display_name: string;
  team: string | null;
  status: 'active' | 'paused';
  created_at: string;
  added_by: string | null;
}

function generateId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalise a WhatsApp phone JID to E.164 (e.g. "6591234567@s.whatsapp.net" → "+6591234567").
 * Returns null for group JIDs (@g.us) or LID JIDs (@lid).
 */
export function jidToE164(jid: string): string | null {
  if (jid.endsWith('@g.us') || jid.endsWith('@lid')) return null;
  const part = jid.split('@')[0].split(':')[0];
  if (!/^\d+$/.test(part)) return null;
  return '+' + part;
}

/**
 * Extract the LID user string from a JID (e.g. "123456789:12@lid" → "123456789").
 */
export function jidToLid(jid: string): string | null {
  if (!jid.endsWith('@lid')) return null;
  return jid.split('@')[0].split(':')[0];
}

/**
 * Lookup a contact by their WhatsApp JID.
 * Supports phone JIDs and LID JIDs.
 * Returns null when no active contact matches.
 */
export function lookupContact(jid: string): Contact | null {
  const e164 = jidToE164(jid);
  const lid = jidToLid(jid);

  if (!e164 && !lid) return null;

  let row: Contact | undefined;
  if (e164) {
    row = getDb().prepare(`SELECT * FROM contacts WHERE phone_e164 = ? AND status = 'active'`).get(e164) as
      | Contact
      | undefined;
  }
  if (!row && lid) {
    row = getDb().prepare(`SELECT * FROM contacts WHERE lid = ? AND status = 'active'`).get(lid) as Contact | undefined;
  }
  return row ?? null;
}

/**
 * Lookup any contact (active or paused) — used by the whitelist gate to
 * give a paused-specific drop path rather than a generic "unknown sender".
 */
export function lookupContactAny(jid: string): Contact | null {
  const e164 = jidToE164(jid);
  const lid = jidToLid(jid);
  if (!e164 && !lid) return null;

  let row: Contact | undefined;
  if (e164) {
    row = getDb().prepare(`SELECT * FROM contacts WHERE phone_e164 = ?`).get(e164) as Contact | undefined;
  }
  if (!row && lid) {
    row = getDb().prepare(`SELECT * FROM contacts WHERE lid = ?`).get(lid) as Contact | undefined;
  }
  return row ?? null;
}

export function addContact(phone_e164: string, display_name: string, team?: string, added_by?: string): Contact {
  const id = generateId();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO contacts (id, phone_e164, display_name, team, status, created_at, added_by)
       VALUES (@id, @phone_e164, @display_name, @team, 'active', @created_at, @added_by)`,
    )
    .run({ id, phone_e164, display_name, team: team ?? null, created_at: now, added_by: added_by ?? null });
  return getDb().prepare(`SELECT * FROM contacts WHERE id = ?`).get(id) as Contact;
}

export function updateContactLid(id: string, lid: string): void {
  getDb().prepare(`UPDATE contacts SET lid = ? WHERE id = ?`).run(lid, id);
}

export function listContacts(): Contact[] {
  return getDb().prepare(`SELECT * FROM contacts ORDER BY display_name`).all() as Contact[];
}

export function listContactsWithoutLid(): Contact[] {
  return getDb()
    .prepare(`SELECT * FROM contacts WHERE lid IS NULL AND status = 'active' ORDER BY display_name`)
    .all() as Contact[];
}

export function findContactByPhoneOrName(identifier: string): Contact | undefined {
  const db = getDb();
  // Try exact E.164 match first
  let row = db.prepare(`SELECT * FROM contacts WHERE phone_e164 = ?`).get(identifier) as Contact | undefined;
  if (row) return row;
  // Try display_name case-insensitive
  row = db.prepare(`SELECT * FROM contacts WHERE lower(display_name) = lower(?)`).get(identifier) as
    | Contact
    | undefined;
  return row;
}

export function setContactStatus(id: string, status: 'active' | 'paused'): void {
  getDb().prepare(`UPDATE contacts SET status = ? WHERE id = ?`).run(status, id);
}

/**
 * Returns true when the WhatsApp JID belongs to an owner-role user.
 * Owner messages bypass the contacts whitelist so the owner's primary
 * WhatsApp chat always reaches the agent regardless of the contacts table.
 *
 * User IDs for WhatsApp are stored as "whatsapp:<jid>" (e.g.
 * "whatsapp:6585905944@s.whatsapp.net"). Device suffixes (:12) are
 * stripped before lookup since they're absent from the stored IDs.
 */
export function isOwnerJid(jid: string): boolean {
  // Strip device suffix: "6585905944:12@s.whatsapp.net" → "6585905944@s.whatsapp.net"
  const normalised = jid.replace(/:(\d+)@/, '@');
  const userId = `whatsapp:${normalised}`;
  const row = getDb().prepare(`SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'owner'`).get(userId);
  return row !== undefined;
}

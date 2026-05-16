import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { initTestDb, closeDb } from './connection.js';
import { runMigrations } from './migrations/index.js';
import {
  lookupContact,
  lookupContactAny,
  addContact,
  jidToE164,
  jidToLid,
  listContacts,
  findContactByPhoneOrName,
  setContactStatus,
  updateContactLid,
} from './contacts.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

// ── jidToE164 ──

describe('jidToE164', () => {
  it('normalises a phone JID to E.164', () => {
    expect(jidToE164('6591234567@s.whatsapp.net')).toBe('+6591234567');
  });

  it('strips the device suffix (:XX)', () => {
    expect(jidToE164('6591234567:12@s.whatsapp.net')).toBe('+6591234567');
  });

  it('returns null for group JIDs', () => {
    expect(jidToE164('120363000000000001@g.us')).toBeNull();
  });

  it('returns null for LID JIDs', () => {
    expect(jidToE164('123456789@lid')).toBeNull();
  });

  it('handles numbers with country code already correct', () => {
    expect(jidToE164('12025551234@s.whatsapp.net')).toBe('+12025551234');
  });
});

// ── jidToLid ──

describe('jidToLid', () => {
  it('extracts user part from LID JID', () => {
    expect(jidToLid('123456789@lid')).toBe('123456789');
  });

  it('strips device suffix from LID JID', () => {
    expect(jidToLid('123456789:12@lid')).toBe('123456789');
  });

  it('returns null for phone JIDs', () => {
    expect(jidToLid('6591234567@s.whatsapp.net')).toBeNull();
  });

  it('returns null for group JIDs', () => {
    expect(jidToLid('120363000000000001@g.us')).toBeNull();
  });
});

// ── lookupContact ──

describe('lookupContact', () => {
  it('returns null for unknown JID', () => {
    expect(lookupContact('6599999999@s.whatsapp.net')).toBeNull();
  });

  it('finds an active contact by phone JID', () => {
    addContact('+6591234567', 'Alice');
    const contact = lookupContact('6591234567@s.whatsapp.net');
    expect(contact).not.toBeNull();
    expect(contact!.display_name).toBe('Alice');
    expect(contact!.phone_e164).toBe('+6591234567');
  });

  it('returns null for paused contact', () => {
    const c = addContact('+6591234568', 'Bob');
    setContactStatus(c.id, 'paused');
    expect(lookupContact('6591234568@s.whatsapp.net')).toBeNull();
  });

  it('finds a contact by LID JID', () => {
    const c = addContact('+6591234569', 'Carol');
    updateContactLid(c.id, '987654321');
    const found = lookupContact('987654321@lid');
    expect(found).not.toBeNull();
    expect(found!.display_name).toBe('Carol');
  });

  it('returns null for group JIDs', () => {
    expect(lookupContact('120363000000000001@g.us')).toBeNull();
  });
});

// ── lookupContactAny ──

describe('lookupContactAny', () => {
  it('returns paused contacts', () => {
    const c = addContact('+6591234570', 'Dave');
    setContactStatus(c.id, 'paused');
    const found = lookupContactAny('6591234570@s.whatsapp.net');
    expect(found).not.toBeNull();
    expect(found!.status).toBe('paused');
  });

  it('returns null for unknown JIDs', () => {
    expect(lookupContactAny('6599999990@s.whatsapp.net')).toBeNull();
  });
});

// ── addContact + listContacts ──

describe('addContact', () => {
  it('inserts and retrieves a contact', () => {
    const c = addContact('+6591234571', 'Eve', 'Engineering', 'owner');
    expect(c.phone_e164).toBe('+6591234571');
    expect(c.display_name).toBe('Eve');
    expect(c.team).toBe('Engineering');
    expect(c.status).toBe('active');
    expect(c.added_by).toBe('owner');
  });

  it('lists all contacts', () => {
    addContact('+6591000001', 'Zara');
    addContact('+6591000002', 'Adam');
    const all = listContacts();
    expect(all.length).toBe(2);
    // Sorted by display_name
    expect(all[0].display_name).toBe('Adam');
    expect(all[1].display_name).toBe('Zara');
  });
});

// ── findContactByPhoneOrName ──

describe('findContactByPhoneOrName', () => {
  it('finds by exact phone', () => {
    addContact('+6591234572', 'Frank');
    const c = findContactByPhoneOrName('+6591234572');
    expect(c).not.toBeUndefined();
    expect(c!.display_name).toBe('Frank');
  });

  it('finds by name (case-insensitive)', () => {
    addContact('+6591234573', 'Grace');
    const c = findContactByPhoneOrName('grace');
    expect(c).not.toBeUndefined();
    expect(c!.phone_e164).toBe('+6591234573');
  });

  it('returns undefined when not found', () => {
    expect(findContactByPhoneOrName('nobody')).toBeUndefined();
  });
});

// ── Non-whitelisted sender drop (routing guard) ──

describe('routing guard', () => {
  it('lookupContact returns null for unknown sender — drop path', () => {
    // Simulates: inbound WhatsApp message from non-whitelisted sender.
    // The adapter calls lookupContactAny; null means drop silently.
    const result = lookupContactAny('6598765432@s.whatsapp.net');
    expect(result).toBeNull();
    // The contacts table is untouched — no DB write occurred.
    expect(listContacts()).toHaveLength(0);
  });
});

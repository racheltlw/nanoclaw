-- Provenance fields for entries promoted from a per-contact local store
-- to the global org-wide store. Only set on global-store entries that
-- originated in a WhatsApp contact session.
ALTER TABLE entries ADD COLUMN source_contact_id TEXT;
ALTER TABLE entries ADD COLUMN original_local_group TEXT;
ALTER TABLE entries ADD COLUMN promoted_to_global_at INTEGER;

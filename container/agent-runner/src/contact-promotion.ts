/**
 * Post-response fact promotion for WhatsApp contact sessions.
 *
 * After each agent turn, extracts candidate facts from the response text,
 * classifies them as personal (about the contact themselves) or org
 * (about projects, decisions, people in the org), then writes:
 *   - personal facts → local contact mnemon only (MNEMON_DB)
 *   - org facts      → local + global mnemon (GLOBAL_MNEMON_DB) with provenance
 *
 * Only active when both CONTACT_ID and GLOBAL_MNEMON_DB are set (i.e., a
 * WhatsApp 1:1 contact session). Errors are always silent — never blocks.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const PROMOTION_TIMEOUT_MS = 8_000;

function log(msg: string): void {
  console.error(`[contact-promotion] ${msg}`);
}

// Sentence-level splitter: split on ". ", "! ", "? " endings.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

// Org-signal keywords: presence suggests org-level fact.
const ORG_KEYWORDS = [
  'project', 'team', 'decision', 'launch', 'deadline', 'budget', 'meeting',
  'stakeholder', 'roadmap', 'sprint', 'milestone', 'client', 'customer',
  'department', 'strategy', 'proposal', 'report', 'contract', 'partner',
];

function classifySentence(s: string): 'personal' | 'org' | null {
  const lower = s.toLowerCase();
  // Skip short or purely factual/procedural sentences unlikely to be worth storing.
  if (s.length < 30) return null;
  for (const kw of ORG_KEYWORDS) {
    if (lower.includes(kw)) return 'org';
  }
  // Heuristic: sentences mentioning "I", "me", "my", "you", "your" are personal.
  if (/\b(i |me |my |you |your )/i.test(lower)) return 'personal';
  return null; // ambiguous — skip without a full classifier call
}

async function mnemonAdd(
  content: string,
  category: string,
  tags: string,
  source: string,
  dbPath: string,
  extraArgs: string[] = [],
): Promise<void> {
  const args = [
    'add', content,
    '--category', category,
    '--tags', tags,
    '--source', source,
    '--importance', '4',
    ...extraArgs,
  ];
  try {
    await execFileP('mnemon', args, {
      timeout: PROMOTION_TIMEOUT_MS,
      env: { ...process.env, MNEMON_DB: dbPath },
    });
  } catch (err) {
    log(`mnemon add failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Extract and promote facts from the agent's response text.
 * No-op when CONTACT_ID or GLOBAL_MNEMON_DB env vars are absent.
 */
export async function promoteNewFacts(responseText: string): Promise<void> {
  const contactId = process.env.CONTACT_ID;
  const localDb = process.env.MNEMON_DB;
  const globalDb = process.env.GLOBAL_MNEMON_DB;

  if (!contactId || !localDb || !globalDb) return;
  if (!responseText || responseText.trim().length < 40) return;

  const parts = sentences(responseText);
  if (parts.length === 0) return;

  const contactName = process.env.CONTACT_DISPLAY_NAME ?? contactId;
  const team = process.env.CONTACT_TEAM ?? '';
  const nowTs = Math.floor(Date.now() / 1000);

  const promotions: Promise<void>[] = [];

  for (const sentence of parts) {
    const kind = classifySentence(sentence);
    if (!kind) continue;

    if (kind === 'personal') {
      promotions.push(
        mnemonAdd(
          sentence,
          'fact',
          `personal,contact:${contactId}`,
          `whatsapp-dm:${contactId}`,
          localDb,
        ),
      );
    } else {
      // Org fact: write to local and promote to global with provenance
      const globalTags = `org,contact:${contactId}${team ? `,team:${team}` : ''}`;
      const globalSource = `promoted-from:${contactId}`;

      promotions.push(
        mnemonAdd(sentence, 'fact', `org,contact:${contactId}`, `whatsapp-dm:${contactId}`, localDb),
      );

      // Global mnemon add with provenance via env-augmented source field
      // (provenance columns are written via --source which encodes the metadata)
      const provenanceSource = `promoted-from:${contactId}|group:${team}|at:${nowTs}`;
      promotions.push(
        mnemonAdd(sentence, 'fact', globalTags, provenanceSource, globalDb, [
          '--source', provenanceSource,
        ]).catch(() => {}),
      );
    }
  }

  await Promise.allSettled(promotions);

  if (promotions.length > 0) {
    log(`Promoted ${promotions.length} fact(s) from turn (contact: ${contactName})`);
  }
}

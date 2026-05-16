#!/usr/bin/env bun

import { openDb } from './db.js';
import { cmdAdd } from './commands/add.js';
import { cmdQuery, formatQueryPretty } from './commands/query.js';
import { cmdGet } from './commands/get.js';
import { cmdList, formatListPretty } from './commands/list.js';
import { cmdUpdate } from './commands/update.js';
import { cmdSupersede } from './commands/supersede.js';
import { cmdDelete } from './commands/delete.js';
import { cmdEdgeAdd, cmdEdgeList } from './commands/edge.js';
import { cmdStats } from './commands/stats.js';

const USAGE: Record<string, string> = {
  add: 'add <content> [--category C] [--importance N] [--tags a,b,c] [--source S]',
  query: 'query <text> [--limit N] [--category C] [--min-importance N] [--include-superseded] [--pretty]',
  get: 'get <id>',
  list: 'list [--category C] [--limit N] [--since UNIX_TS] [--include-superseded] [--pretty]',
  update: 'update <id> [--content ...] [--importance N] [--tags ...] [--add-tags ...] [--remove-tags ...]',
  supersede: 'supersede <old-id> <new-content> [--category C] [--importance N] [--tags ...] [--source S]',
  delete: 'delete <id>',
  edge: 'edge add <from-id> <to-id> --relation R\n       edge list <id>',
  stats: 'stats',
};

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function die(msg: string): never {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function flag<T extends string>(f: Record<string, string | true>, key: string): T | undefined {
  const v = f[key];
  return typeof v === 'string' ? (v as T) : undefined;
}

function intFlag(f: Record<string, string | true>, key: string): number | undefined {
  const v = flag(f, key);
  return v !== undefined ? parseInt(v, 10) : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(
      'mnemon — knowledge graph CLI\n\nUsage: mnemon <command> [options]\n\nCommands:\n' +
        Object.values(USAGE)
          .map((u) => `  ${u}`)
          .join('\n') +
        '\n',
    );
    process.exit(0);
  }

  const [command, ...rest] = argv as [string, ...string[]];
  const { positional, flags } = parseArgs(rest);

  if (flags['help']) {
    process.stdout.write(`Usage: mnemon ${USAGE[command] ?? command}\n`);
    process.exit(0);
  }

  const db = openDb();

  try {
    switch (command) {
      case 'add': {
        if (!positional[0]) die(`Usage: mnemon ${USAGE.add}`);
        const id = await cmdAdd(db, positional[0], {
          category: flag(flags, 'category'),
          importance: intFlag(flags, 'importance'),
          tags: flag(flags, 'tags'),
          source: flag(flags, 'source'),
        });
        process.stdout.write(String(id) + '\n');
        break;
      }

      case 'query': {
        if (!positional[0]) die(`Usage: mnemon ${USAGE.query}`);
        const results = await cmdQuery(db, positional[0], {
          limit: intFlag(flags, 'limit'),
          category: flag(flags, 'category'),
          minImportance: intFlag(flags, 'min-importance'),
          includeSuperseded: flags['include-superseded'] === true,
        });
        if (flags['pretty']) {
          process.stdout.write(formatQueryPretty(results) + '\n');
        } else {
          out(results);
        }
        break;
      }

      case 'get': {
        if (!positional[0]) die(`Usage: mnemon ${USAGE.get}`);
        const entry = cmdGet(db, parseInt(positional[0], 10));
        if (!entry) die(`Entry ${positional[0]} not found`);
        out(entry);
        break;
      }

      case 'list': {
        const entries = cmdList(db, {
          category: flag(flags, 'category'),
          limit: intFlag(flags, 'limit'),
          since: intFlag(flags, 'since'),
          includeSuperseded: flags['include-superseded'] === true,
        });
        if (flags['pretty']) {
          process.stdout.write(formatListPretty(entries) + '\n');
        } else {
          out(entries);
        }
        break;
      }

      case 'update': {
        if (!positional[0]) die(`Usage: mnemon ${USAGE.update}`);
        await cmdUpdate(db, parseInt(positional[0], 10), {
          content: flag(flags, 'content'),
          importance: intFlag(flags, 'importance'),
          tags: flag(flags, 'tags'),
          addTags: flag(flags, 'add-tags'),
          removeTags: flag(flags, 'remove-tags'),
        });
        process.stderr.write('updated\n');
        break;
      }

      case 'supersede': {
        if (!positional[0] || !positional[1]) die(`Usage: mnemon ${USAGE.supersede}`);
        const newId = await cmdSupersede(db, parseInt(positional[0], 10), positional[1], {
          category: flag(flags, 'category'),
          importance: intFlag(flags, 'importance'),
          tags: flag(flags, 'tags'),
          source: flag(flags, 'source'),
        });
        process.stdout.write(String(newId) + '\n');
        break;
      }

      case 'delete': {
        if (!positional[0]) die(`Usage: mnemon ${USAGE.delete}`);
        try {
          cmdDelete(db, parseInt(positional[0], 10));
          process.stderr.write('deleted\n');
        } catch (e) {
          process.stderr.write((e as Error).message + '\n');
          process.exit(1);
        }
        break;
      }

      case 'edge': {
        const sub = positional[0];
        if (sub === 'add') {
          if (!positional[1] || !positional[2] || !flags['relation']) {
            die(`Usage: mnemon edge add <from-id> <to-id> --relation R`);
          }
          cmdEdgeAdd(db, parseInt(positional[1], 10), parseInt(positional[2], 10), flags['relation'] as string);
          process.stderr.write('edge added\n');
        } else if (sub === 'list') {
          if (!positional[1]) die(`Usage: mnemon edge list <id>`);
          out(cmdEdgeList(db, parseInt(positional[1], 10)));
        } else {
          die(`Usage: mnemon ${USAGE.edge}`);
        }
        break;
      }

      case 'stats': {
        out(cmdStats(db));
        break;
      }

      default:
        die(`Unknown command: ${command}\nRun mnemon --help for usage.`);
    }
  } finally {
    db.close();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(((e as Error).message ?? String(e)) + '\n');
  process.exit(1);
});

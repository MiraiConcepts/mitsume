/**
 * mitsume-sync — Yjs sync server for the notes canvas.
 *
 * Hocuspocus v4 on Node (its Server class is built on node:http + the crossws
 * node adapter, which refuses to run under Bun — verified 2026-07-11), with
 * whole-document state persisted into a single-table SQLite file via the
 * built-in node:sqlite (no native deps). Authless by design: the host Caddy
 * proxies /sync/* to this container and tailnet reachability is the auth
 * boundary (see docs/Deploy.md). Stores are
 * debounced (2s default) and flushed on SIGINT/SIGTERM by Hocuspocus itself.
 */
import { Database } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 1234);
const SQLITE_PATH = process.env.SQLITE_PATH ?? '/data/documents.sqlite';

const db = new DatabaseSync(SQLITE_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec(
  `CREATE TABLE IF NOT EXISTS documents (
     name TEXT PRIMARY KEY,
     state BLOB NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
);

const selectState = db.prepare('SELECT state FROM documents WHERE name = ?');
const upsertState = db.prepare(
  `INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(name) DO UPDATE SET
     state = excluded.state, updated_at = excluded.updated_at`,
);

const server = new Server({
  port: PORT,
  address: '0.0.0.0',
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const row = selectState.get(documentName) as
          | { state: Uint8Array }
          | undefined;
        return row ? new Uint8Array(row.state) : null;
      },
      store: async ({ documentName, state }) => {
        upsertState.run(documentName, state, Date.now());
      },
    }),
  ],
  onRequest: async ({ request, response }) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('ok');
      // A hook rejecting with an empty error stops the default handler.
      throw null;
    }
  },
});

await server.listen();
console.log(`mitsume-sync listening on :${PORT}, sqlite at ${SQLITE_PATH}`);

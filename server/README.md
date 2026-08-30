# server

Self-hosted notes backend — two small containers, deployed by merging
`compose.yml` into the HOST docker-compose stack (same stack as the `mitsume`
web container). Full deploy instructions + host-Caddyfile snippet:
`docs/Deploy.md` §Notes backend. Architecture decisions:
`docs/Requirements.md` §9.4–9.5 + decisions log #10–12.

- **`sync/`** — `mitsume-sync`: Hocuspocus v4 Yjs sync server on Node 24
  (its Server class needs Node — the crossws node adapter refuses Bun),
  persisting whole-document state into a single-table SQLite file via
  node:sqlite (no native deps). `smoke-test.ts` exercises live sync +
  restart persistence (see its header).
- **`blobs/`** — `mitsume-blobs`: Caddy + the webdav plugin serving a flat
  directory of SHA-256-named image blobs (`PUT/GET/HEAD/DELETE /<hash>`),
  immutable Cache-Control on existing files only.

Both run **authless behind the tailnet** (host Caddy is the boundary — same
posture as `/dav/`; no credentials exist client-side or in these containers).
Images `ghcr.io/miraiconcepts/mitsume-sync` + `mitsume-blobs` build on every `v*`
tag (`.github/workflows/server-images.yml`); Watchtower redeploys.

Local dev runs the same containers via `tooling/dev-proxy/compose.yml`
(built from this directory, proxied at `http://localhost:8880/sync` and
`/blobs/`).

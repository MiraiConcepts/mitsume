# mitsume

Personal, single-user, local-first note-taking app for Android and web, syncing
to a self-hosted backend.

Notes live on **leaves**. A leaf's notes (left) and infinite canvas (right)
are two views of the same chunks: every paragraph chunk and every image is
also a card you can drag, pinch, and arrange on a dot grid. Type `---` to
start a new chunk. A rail of icons switches, adds, reorders, and deletes
leaves. Edits merge
without conflicts (Yjs CRDT) and survive offline; images are stored once by
content hash.

- **Client:** [`app/`](app/) — Expo / React Native (+ React Native Web), TypeScript
- **Server:** [`server/`](server/) — Hocuspocus (Yjs doc sync, SQLite) + a
  content-addressed blob store (Caddy + webdav)
- **Spec:** [docs/Requirements.md](docs/Requirements.md) ·
  **Deploy:** [docs/Deploy.md](docs/Deploy.md) ·
  **Release:** [docs/Release.md](docs/Release.md)

The calendar that used to live here is now
[hitome](https://github.com/MiraiConcepts/hitome).

## Development

```sh
cd app
bun install
bun run web:proxy   # Metro on :8081; browse the dev proxy at :8880
bun run typecheck
bun run lint
bun test $(find src -name '*.test.ts')
```

Start the dev proxy first, from `tooling/dev-proxy/`: `docker compose up -d`.
It serves `/sync` and `/blobs/` same-origin, which is how the app finds them.

## Distribution

Android ships as a universal APK attached to GitHub Releases, tracked by
[Obtainium](https://github.com/ImranR98/Obtainium). Web deploys to the
self-hosted environment via `ghcr.io/miraiconcepts/mitsume`.

> Notes do **not** sync on Android yet — no backend URL is baked into the APK,
> so the canvas is local-only there. See [docs/Deploy.md](docs/Deploy.md).

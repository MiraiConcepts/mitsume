# mitsume

Personal, single-user, local-first notes app. Expo SDK 56 / RN 0.85 (+ RN Web)
client; self-hosted backend (Hocuspocus for doc sync + a content-addressed blob
store for pasted images). Targets web + Android (Obtainium) — no iOS.

The unit of content is a **leaf**: one free-form notepad (left) beside one
image canvas (right). The rail on the far left switches, adds (+, icon
picker), reorders (mouse drag, web only) and deletes (right-click / Android
long-press, confirmed, never the last one) leaves. In code the canvas half
keeps `canvas` names; the doc's root map is still `'canvases'` for data
compatibility.

The calendar that used to live here is now
[hitome](https://github.com/MiraiConcepts/hitome), with its own package id,
image, and origin. Nothing here talks CalDAV.

## Layout

- `app/` — the Expo client (all product code; has its own CLAUDE.md).
- `docs/` — `Requirements.md` (spec + decisions log, covers both apps' history),
  `Deploy.md` (web + same-origin Caddy + notes backend), `Release.md` (Android
  APK pipeline).
- `server/` — notes backend: `sync/` (Hocuspocus v4 + SQLite, Node) and
  `blobs/` (Caddy + webdav, SHA-256-named files); merge-ready `compose.yml`
  for the host stack (see its README).
- `tooling/` — `dev-proxy/` (dockerized same-origin Caddy for web dev; also
  runs the notes backend locally), `android-builder/` (local sign + release
  scripts).
- `.claude/plans/` — implementation plans and build logs (historical record,
  including the calendar work that moved to hitome).

## Dev loop (bun for scripts/checks; Metro and Gradle run under node)

Bun runs checks, tests, and package installs. Metro and the Android build both
need real node: `--bun` shims node→bun, and bun can't load fsevents (Metro's
macOS file watcher — edits silently never reach the bundle) or run the Gradle
helper scripts.

- Always `cd app/` first, then plain `bun run web:proxy` — NOT `--bun`
  (breaks file watching → stale bundles; found 2026-07-12). Edits then ship on
  save; only metro.config.js changes need a Metro restart.
- Browse the dockerized dev proxy at `http://localhost:8880` (which serves
  `/sync` and `/blobs/` same-origin), NOT Metro's `:8081` directly. Start it
  from `tooling/dev-proxy/`: `docker compose up -d`. No `.env` needed — both
  services are authless and built locally from `server/`. Docker runtime is
  colima.
- Android hot reload: plain `bun run android:dev` — do NOT add `--bun`. The
  Gradle steps shell out to `node` (expo autolinking, entry resolution), and
  `--bun` breaks the build in ~3s at `settings.gradle`.
  (debug build under `com.miraiconcepts.mitsume.dev`, coexists with the release
  app; needs the local Android SDK, env in `~/.zshrc`.)
- Checks from `app/`: `bun run typecheck`, `bun run lint`, `bun run
  format:check`.
- Tests: local jest is broken under bun's runtime — run `bun test <files>`
  instead; CI runs jest via `bun run test`.
- Install Expo packages with `bunx expo install` (SDK 56 line), never
  `bun add expo-*@latest` (SDK 57 is out).

## Deploy & release

- Releases are SYMMETRIC: pushes to `main` only run CI checks; a `v*` tag
  builds the web image, the two backend images, AND the unsigned APK from the
  same commit — every surface ships the same version (see the in-app badge).
- Cut: bump `expo.version` + `android.versionCode` in `app/app.json` → push →
  `git tag vX.Y.Z && git push origin main vX.Y.Z` → green → sign + publish with
  `tooling/android-builder/sign-release.sh` → Obtainium + Watchtower deliver.
  See `docs/Release.md`, `docs/Deploy.md`.

## Invariants

- **The sync and blob volumes are the only copy of your notes.** The app is
  local-first, so a device holds a replica, not the archive. Backups cover
  `MITSUME_SYNC_VOLUME` and `MITSUME_BLOBS_VOLUME`.
- **Android does not sync.** No `EXPO_PUBLIC_SYNC_URL`/`_BLOBS_URL` is baked, so
  the APK's canvas is local-only. Web derives both from the page origin. Fix by
  setting them in `.github/workflows/android-apk.yml`.
- Rounded UI is 4px (`Spacing.one`).
- Port 8080 on this Mac belongs to an unrelated dev server; mitsume tooling
  uses 8880.

# Requirements — Personal Note-Taking App

> Status: Decided · Last updated: 2026-06-09

## 1. Overview

A **personal, single-user note-taking application** that runs on **Android**
(distributed via [Obtainium](https://github.com/ImranR98/Obtainium), outside the
Play Store) and as a **web app**. The app is **local-first and fully offline**,
with **account-based sync** to a **self-hosted backend** so the same notes are
available on both the phone and the web.

There is no public sign-up or multi-tenant login. Because it is personal and
self-hosted, devices authenticate to the backend with a **device pairing token /
secret** rather than a username + password flow.

## 2. Goals

- Capture and organize personal notes quickly, on phone or in the browser.
- Work **fully offline**; never block on a network connection.
- Keep notes (and attachments) in sync across devices via a self-hosted backend.
- Stay simple to install and self-host — no third-party cloud account required.

## 3. Non-Goals

- Multi-user accounts, sharing, or real-time collaboration.
- Public account registration or social login.
- App Store / Play Store distribution (Android ships via Obtainium).
- iOS support (not in scope).

## 4. Target Platforms & Distribution

| Platform | Distribution | Priority |
|----------|--------------|----------|
| Android  | APK via Obtainium tracking a **GitHub Releases** feed | P0 |
| Web      | Hosted web app (desktop + mobile browser)             | P0 |
| iOS      | Not in scope                                           | — |

- **Update channel**: each Android release is published as a **GitHub Release**
  with a versioned APK; Obtainium polls the repo for updates.
- Web is deployed continuously to the self-hosted environment.

## 5. Functional Requirements

### 5.1 Notes & Editing
- **Markdown / rich text** — headings, lists, code blocks, formatting, preview.
- **Checklists / to-dos** — tappable checkbox items inside a note.
- **Images & attachments** — embed photos and files.
- **Voice notes** — record and attach audio.
- **Sketches / drawing** — freehand drawing / handwriting.
- Create, edit, and delete notes.

### 5.2 Organization
- **Folders / notebooks** — hierarchical organization.
- **Tags** — multiple tags per note.
- **Search** — fast full-text search across titles, bodies, and tags.
- **Pin / favorite** — keep important notes at the top.
- **Sort & filter** — sort by date/title; filter by tag/folder.

### 5.3 History & Recovery
- **Trash / soft delete** — deleted notes recoverable for a grace period.
- **Version history** — view and restore previous versions of a note.

### 5.4 Storage & Offline
- **Local-first**: every note and attachment stored on-device.
- **Fully offline**: all reading and editing works with zero connectivity.
- Local store backs full-text search and instant note open.

### 5.5 Sync
- **Account-based cloud sync** against a **self-hosted backend**.
- Devices pair via a **device token / pairing secret** (no login UI, no sign-up).
- Bidirectional: changes on Android appear on web and vice versa, including
  attachments, voice notes, and sketches.
- **The self-hosted server is the system of record / backup** (see §5.8).
- **Conflict handling**: strategy TBD — e.g. last-write-wins per note with a
  conflict copy for divergent edits. *[Decision pending — see §10.]*

### 5.6 Notifications & Reminders
- **Per-note reminders** — set a date/time alarm on a note → local notification.
- **Recurring reminders** — repeat daily/weekly (e.g. journaling prompts).
- **Sync notifications** — notify on sync completion and on sync conflicts.
- Reminders fire **offline** via local OS notifications (no push server needed).

### 5.7 Capture & OS Integration
- **Share-sheet capture** — send text/images from other apps into a new note.
- **Home-screen widget** (Android) — quick view / quick add.
- **Quick-add shortcut** — app shortcut / FAB to jump straight to a new note.
- **Keyboard shortcuts (web)** — new note, search, save.

### 5.8 Backup & Portability
- The **self-hosted backend is the primary backup** — all devices reconcile to it.
- *(Recommended add)* Periodic server-side snapshot/export of the data store so a
  fresh device or server can be restored. *[Decision pending — see §10.]*

## 6. Appearance & Accessibility

- **Dark / light theme** — manual and system-driven.
- **Adjustable font size** — scale text for readability.
- **Accessibility** — screen-reader labels, sufficient contrast, focus order.

## 7. Security & Privacy

- **No app-level lock or at-rest encryption** requested — relies on device-level
  security. *(Flagged: notes sync to and are stored in plaintext on the server;
  acceptable for a private self-hosted box. Revisit if the server is ever exposed
  beyond a trusted network — see §10.)*
- **Sync transport**: HTTPS/TLS required.
- **Device token** stored securely on-device (keystore/secure storage).
- **No analytics / telemetry** — data stays on-device and on the user's server.

## 8. Non-Functional Requirements

- **Offline reliability**: fully functional with zero connectivity.
- **Performance**: instant local search and note open on a mid-range phone.
- **Portability**: notes exportable (Markdown + assets) to avoid lock-in.
- **Self-hostability**: backend simple to deploy (single container/binary).
- **Resilience**: interrupted syncs resume; no data loss on conflict.
- **Battery/storage**: efficient local store; bounded attachment cache.

## 9. Architecture & Technology Stack (Decided)

All major decisions are resolved. The architecture is **CRDT-based, offline-first,
self-hosted** — chosen to satisfy "technically best" + "seamless multi-device
merging." Research basis: As-of 2026-06-09 (see §11 for the verified rationale).

### 9.1 Client — React Native (Expo) + React Native Web
One JS/TS codebase across Android and web. **User-confirmed 2026-06-09.**
- **Why over Flutter:** a notes app's web target is text-heavy; Flutter Web
  (CanvasKit) breaks native text selection and find-in-page by default, while
  React Native Web renders real DOM. The CRDT engine (below) is JavaScript and
  runs natively on both platforms — Flutter would require a Rust bridge.
- **Why over PWA/Capacitor:** weaker home-screen widgets and background reminders.
- Android-only widgets are also *easier* in RN (`react-native-android-widget`,
  JSX UI) than Flutter (`home_widget` + native Jetpack Glance).
- **OTA bonus:** EAS Update ships JS/asset updates to the sideloaded APK without a
  full reinstall.

### 9.2 Sync engine — Yjs (CRDT)
- **Yjs** (MIT, pure-JS, no WASM) — runs cleanly in Hermes on RN's New
  Architecture and on web. Chosen over Automerge (WASM, heavier mobile story);
  Automerge is the fallback only if Git-style note history becomes a headline
  feature.
- Conflict resolution is **conflict-free by construction** — no last-write-wins
  rules or conflict copies needed. Doc shape per note: `Y.Text` (body via
  Tiptap), `Y.Array` (checklists), `Y.Map` (tags/metadata + blob references).
- **Note-data growth risk:** CRDT update logs grow unbounded — plan periodic
  snapshotting/compaction.

### 9.3 Editor — Tiptap (ProseMirror) + Yjs binding
- Headless ProseMirror with first-class Yjs collaboration and mature Markdown
  serialization. State-of-the-art rich-text-CRDT path in 2026.

### 9.4 Sync server (self-hosted) — Hocuspocus (supersedes y-sweet · 2026-07-11)
- **Hocuspocus v4** (`@hocuspocus/server`, MIT, Tiptap team) — Node container
  built from `server/sync/` (`ghcr.io/miraiconcepts/mitsume-sync`), persisting
  whole-document state to a SQLite file on a volume (node:sqlite, no native
  deps). Authless behind the tailnet, same-origin under the host Caddy at
  `/sync/*` (see docs/Deploy.md §Notes backend).
- *Why the change:* the original pick, **y-sweet**, died with Jamsocket
  (founders joined Modal 2025-07; docs site offline, repo frozen at v0.9.1,
  bugfix PRs unanswered). Hocuspocus v4 went stable 2026-05 and is actively
  maintained. Decided 2026-07-11 (decisions log #11).

### 9.5 Blob storage — content-addressed blob directory (supersedes MinIO · 2026-07-11)
- Attachments, images, audio, and sketch files are **never stored in the CRDT**.
- Bytes are hashed (**SHA-256**) and stored as **flat hash-named files** served
  by a Caddy + webdav container built from `server/blobs/`
  (`ghcr.io/miraiconcepts/mitsume-blobs`): `PUT/GET/HEAD/DELETE /blobs/<hash>`, no
  credentials (tailnet + host Caddy = the boundary), immutable Cache-Control
  on existing files. Only the **hash + content-type + size** live in the Yjs doc.
- Pasted canvas images store TWO blobs: the untouched original (future
  view/export) and a downscaled WebP display rendition (≤2048px long edge)
  that the canvas renders.
- Blob deletion is client-refcounted against the doc (bytes removed when the
  last referencing item is deleted); a server-side GC pass is future work.
- *Why the change:* **MinIO** open source was feature-stripped in 2025 and the
  repo archived 2026-04; for single-user content-addressed blobs a plain
  directory behind the web server is simpler and can't be rug-pulled. Decided
  2026-07-11 (decisions log #12).

### 9.6 Local persistence
- **Web:** `y-indexeddb`.
- **Android (RN):** `y-op-sqlite` (op-sqlite) + a `crypto`/`getRandomValues`
  polyfill for Hermes.

### 9.7 Device auth / pairing
- Single-user, so a **static bearer token / pairing secret** issued by the
  server is sufficient — no username/password UI. Token stored in secure
  storage (Android Keystore / web secure storage) and sent over **HTTPS/TLS**
  only. (y-sweet auth + reverse-proxy token check.)

### 9.8 Sketch data format
- Persisted as **vector** (point/path JSON: color, width, stroke id) rather than
  raster — smaller, re-editable, and renders consistently across RN
  (`@shopify/react-native-skia`) and web. Optional raster snapshot for thumbnails.

### 9.9 Backup policy (server-side)
- Live CRDT sync is **not** a backup. Take **periodic snapshots of the y-sweet
  persistence + MinIO buckets** (e.g. nightly `restic`/object-store snapshot) so
  a corrupted/deleted note or a lost server can be restored to a point in time.

### 9.10 Encryption posture
- **Now:** TLS in transit; plaintext at rest on the trusted self-hosted server
  (no app lock / at-rest encryption, per §7).
- **Future trigger:** if the server is ever exposed beyond a trusted network,
  add end-to-end encryption by encrypting Yjs updates client-side before sync
  (server stores ciphertext only). Designed-for but not built now.

### 9.11 Distribution & updates
- Android: universal release **APK** (CI builds unsigned via `expo prebuild` +
  Gradle; signed locally with a stable key — see `docs/Release.md`) attached to a
  **GitHub Release**; Obtainium tracks the repo. Use a single universal APK (not
  per-arch splits) so Obtainium updates don't break.
- Web: continuous deploy to the self-hosted environment.

## 10. Decisions Log (all resolved)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Client framework | **React Native (Expo) + React Native Web** (§9.1) |
| 2 | Self-hosted backend | **y-sweet** sync server + **MinIO** blobs (§9.4–9.5) |
| 3 | Sync conflict resolution | **Yjs CRDT** — conflict-free by construction (§9.2) |
| 4 | Attachment/audio storage | **MinIO**, content-addressed by SHA-256, refs in doc (§9.5) |
| 5 | Device pairing/token | **Static bearer token** over TLS, secure-stored (§9.7) |
| 6 | Server-side backup | **Periodic y-sweet + MinIO snapshots** (§9.9) |
| 7 | Encryption revisit | **TLS now; client-side E2E if server leaves trusted net** (§9.10) |
| 8 | Sketch format | **Vector (point/path JSON)**, optional raster thumb (§9.8) |
| 9 | Calendar (CalDAV) auth · 2026-07-06 | **Server-side credential injection**: clients (web + Android) store no credentials; the host Caddy injects `Authorization` on `/dav/*` → Radicale. Tailnet reachability = access on that origin (accepted; single-user tailnet — consistent with §9.10 posture). Supersedes the §9.7 token model *for the calendar component only*. |
| 10 | Notes V1 surface · 2026-07-11 | **Spatial canvas**: the notes pane is a CanvasBar (one icon per canvas) + an infinite pan/zoom 32px-grid canvas holding pasted images (Yjs item model: id/x/y/w/h/z + blob refs). The item model is view-agnostic — a future toggle will render the same items as **list notes** (the §9.3 Tiptap document editor remains the plan for text notes). Server = source of truth; client = y-indexeddb + IndexedDB blob cache with an offline upload queue. |
| 11 | Sync server · 2026-07-11 | **Hocuspocus v4** replaces the defunct y-sweet (§9.4). Authless behind tailnet at `/sync/*`; SQLite persistence on a volume; images `ghcr.io/miraiconcepts/mitsume-sync` built on `v*` tags. |
| 12 | Blob storage · 2026-07-11 | **Content-addressed blob directory** (Caddy + webdav, `ghcr.io/miraiconcepts/mitsume-blobs`) replaces archived MinIO (§9.5). Same-origin `/blobs/<sha256>`, no client credentials, originals + WebP display renditions, client-refcounted deletion. |
| 13 | Event editor: recurrence, alarms, location · 2026-07-19 | **Recurrence**: preset RRULEs (daily/weekdays/weekly/monthly/yearly + forever/until/count); anything richer is read-only "Custom" and never rewritten (incl. RECURRENCE-ID overrides). **Alarms**: one DISPLAY VALARM per event; the app itself fires them — Android via expo-notifications with exact-alarm permissions (`USE_EXACT_ALARM`), reconciled against CalDAV on every open/foreground (14-day horizon, deterministic ids); web best-effort while a tab is open. Notification tap deep-links `?day=`. **Location**: Photon (photon.komoot.io) search-as-you-type — the app's first third-party call, silently degrading to plain text offline; only the chosen label is stored in `LOCATION`. Self-hosted Photon behind Caddy is the hardening path if fair-use ever bites. **Presentation**: shared form, width-based shells — bottom sheet (<768px, @gorhom/bottom-sheet 5.2.14 exact pin) vs centered dialog; native pickers per platform (@expo/ui Compose dialogs on Android, DOM date/time inputs on web); date-as-title in `BrandColor`. |

| 14 | Midnight-spanning timed events · 2026-08-02 | **The sun means a whole day, nothing else.** A timed event crossing midnight keeps every day it touches (no cutoff — a 06:00 "day start" that collapsed small-hours ends onto the start day was tried in v0.5.2 and dropped in v0.5.3 as a magic constant that also hid in-progress events). Its final day leads with `→ HH:MM` (the end time) instead of the all-day sun; middle days it fully covers still get the sun, since it genuinely owns those. Day coverage is `eventLastMs` (utils/date) — end exclusive at exact midnight — shared by `eventDays` and the month-grid layout so the widget and grid can't drift. |

## 11. Summary

### Requirements (resolved via interview)
- **App type**: Personal note-taking (single user).
- **Distribution**: Obtainium (Android APK via GitHub Releases) + web app.
- **Auth**: No public sign-in; device-token pairing for sync.
- **Editing**: Markdown/rich text, checklists, images, voice notes, sketches.
- **Organization**: Folders/notebooks, tags, search, pin/favorite, sort/filter.
- **History**: Trash/soft delete, version history.
- **Storage**: Local-first + self-hosted backend (server is the backup).
- **Offline**: Fully offline.
- **Sync**: Account-based cloud sync to self-hosted backend.
- **Reminders**: Per-note, recurring, plus sync notifications.
- **Capture**: Share-sheet, home-screen widget, quick-add, web keyboard shortcuts.
- **Appearance**: Dark/light theme, adjustable font size, accessibility.
- **Security**: No app lock / at-rest encryption (device-level only); HTTPS sync.

### Decided stack (one line)
**Expo / React Native (+ React Native Web)** client · **Yjs** CRDT ·
**Tiptap** editor · **y-sweet** self-hosted sync server · **MinIO**
content-addressed blob store · local persistence via **y-indexeddb** (web) /
**y-op-sqlite** (Android) · **GitHub Releases → Obtainium** distribution.

> Research basis: live-web verified, As-of 2026-06-09. All chosen components are
> MIT/Apache-2.0 (no source-available/non-compete licensing).

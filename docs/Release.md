# Release — one cut ships both channels (web + Android, versions in parity)

> Releases are **symmetric** (decided 2026-07-07): pushes to `main` only run CI
> checks; a `v*` tag fires BOTH the web image and the Android APK from the same
> commit, so both platforms always carry the same version (visible in the
> in-app version badge, bottom-right). Android lands as a signed universal APK
> on a GitHub Release, tracked by
> [Obtainium](https://github.com/ImranR98/Obtainium); web lands as
> `ghcr.io/miraiconcepts/mitsume:latest`, deployed by Watchtower.

## Architecture (locked 2026-07-06)

- **CI builds, local signs** (hybrid): GitHub Actions (`.github/workflows/android-apk.yml`)
  builds the APK **unsigned** on real x86_64 Linux — the canonical platform — and
  uploads it as an artifact together with `apksigner.jar`. Signing + publishing happen
  locally via `tooling/android-builder/sign-release.sh`. **GitHub holds no secrets;
  the signing keystore never leaves the maintainer's machine.**
  (Memoka precedent signed in CI via `KEYSTORE_BASE64` secret; mitsume deliberately
  keeps key custody local.)
- **No baked server URL.** Web derives `/sync` and `/blobs/` from the page origin;
  an APK has none, so the Android canvas is **local-only** — it does not sync. Setting
  `EXPO_PUBLIC_SYNC_URL`/`EXPO_PUBLIC_BLOBS_URL` in the APK workflow would change that,
  and the ts.net hostname is public-by-decision if you do (already exposed via
  Certificate Transparency, unreachable off-tailnet; Funnel off).
- **Signing keystore**: `~/.mitsume-keys/` (`release.keystore` + `keystore.properties`),
  NEVER in git. ⚠️ **Back it up** — Android only installs updates signed by the same
  key; losing it means uninstall/reinstall + Obtainium re-add.
- APKs contain **no credentials** (server-side injection — `docs/Deploy.md`).

## Cutting a release

1. Batch changes on `main` until the set feels release-worthy (CI checks every
   push; nothing deploys).
2. Bump **both** in `app/app.json`: `expo.version` (e.g. `0.3.0`) and
   `expo.android.versionCode` (+1 — Android refuses same-code updates).
3. Commit + push, then tag:
   ```sh
   git tag v0.3.0 && git push origin main v0.3.0
   ```
   The tag fires **both** workflows (`Android APK` + `Web image`) from the same
   commit. Wait for green (`gh run watch`).
4. Sign + publish the Android side locally:
   ```sh
   ./tooling/android-builder/sign-release.sh
   ```
   (Downloads the artifact, signs with `~/.mitsume-keys` in a small JRE container,
   verifies the signature + baked URL, creates the GitHub Release with the APK.)
5. Obtainium picks up the APK on its next poll; Watchtower deploys the web image
   on its next cycle. Verify parity via the version badge on both.

`gh workflow run 'Android APK'` / `'Web image'` (workflow_dispatch) still exist
for untagged smoke builds — they publish nothing user-facing on their own
(Watchtower does follow `:latest`, so dispatching Web image deploys; prefer tags).

## Web-only releases (fast lane)

For web-only iteration, skip the APK cost: bump `expo.version` to a suffixed
patch on the current release (e.g. `0.2.6` → `0.2.6-web.1`; leave `versionCode`
alone), commit, then:

```sh
git tag v0.2.6-web.1 && git push origin main v0.2.6-web.1
```

The `-web` suffix makes the Android workflow skip itself; only the web image
builds and deploys. The version badge makes the divergence visible (web
`0.2.6-web.1`, phone `0.2.6`) — deliberate, not drift. The next full release
(e.g. `v0.2.7`) re-syncs both channels. Never run `sign-release.sh` for a
web-only cut.

## Phone setup (one-time)

Install Obtainium (F-Droid) → **Add App** → source URL `https://github.com/MiraiConcepts/mitsume`
→ install. Updates arrive as notifications thereafter.

## Fallback: fully local Docker build (no GitHub)

`./tooling/android-builder/build.sh` builds AND signs entirely on this machine
(derived multiarch image: x86 Android tools under Rosetta + native arm64 Node; Maven
mirror for Sonatype IP blocks; needs colima ≥10 GB). Status: debugged through all
known failure layers but not yet proven end-to-end — prefer the CI path.

## Notes

- One-time repo setup already done: keystore generated 2026-07-06. The
  `MITSUME_DAV_URL` Actions variable belonged to the calendar and is now hitome's.
- `dist-apk/`, `app/android/`, and the builder `.env` are gitignored/disposable.
- Revisit triggers for the baked-URL decision: Funnel ever enabled, tailnet gains
  users, or URL churn (→ switch to first-run URL entry; design shelved in
  `.claude/plans/settings-page-plan.md`).

# app

The Expo client. See the [repo README](../README.md) for what mitsume is, and
[CLAUDE.md](../CLAUDE.md) for the dev loop and its sharp edges.

```sh
bun install
bun run web:proxy   # Metro on :8081 — browse the dev proxy at :8880, not :8081
bun run android:dev # debug build, coexists with the release app
```

Never prefix these with `--bun`: it shims node, which breaks Metro's file
watcher (silently stale bundles) and the Gradle build's node calls.

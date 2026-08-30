# Deploy — mitsume (notes) web + sync + blobs

> Android/Obtainium is a separate track — see `docs/Release.md`.

## Shape

Three containers on one origin: `mitsume` (the static web app, served at `/`),
`mitsume-sync` (Hocuspocus v4 — Yjs doc sync over websocket, SQLite on a
volume) and `mitsume-blobs` (Caddy + webdav — flat SHA-256-named image files on
a volume). The sync and blob services are proxied under `/sync` and `/blobs/`
on that same origin, so the browser never makes a cross-origin request and **no
CORS configuration is needed anywhere**.

Both backends are **authless by design**: tailnet reachability = access, zero
client credentials. Single-user tailnet, secured devices (Requirements §9.10
posture). Optional hardening: a Tailscale ACL restricting which devices may
reach this port.

```
web browser ──┐   /            ┌─► mitsume:80        (static app)
              ├──► host Caddy ─┼─► mitsume-sync:1234 (/sync,  websocket)
Android app ──┘                └─► mitsume-blobs:8080 (/blobs/)
```

CD is release-gated (symmetric with Android — see `docs/Release.md`): a `v*`
tag builds `ghcr.io/miraiconcepts/mitsume:latest`
(`.github/workflows/web-image.yml`) plus the two backend images
(`.github/workflows/server-images.yml`), and Watchtower redeploys. Pushes to
`main` deploy nothing.

> **The calendar used to live on this origin.** It is now
> [hitome](https://github.com/MiraiConcepts/hitome), with its own image, port,
> and site block. Nothing here proxies `/dav/` any more, and mitsume needs an
> origin of its own — hitome took the old one.

## 1. Compose services

Add the web app to `docker-compose.yml` (mirrors the stack's hardening
conventions):

```yaml
  mitsume:
    container_name: mitsume
    image: ghcr.io/miraiconcepts/mitsume:latest
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      MITSUME_REVERSE_PROXY_PORT: ${MITSUME_REVERSE_PROXY_PORT}
    ports:
      - ${MITSUME_REVERSE_PROXY_PORT}:${MITSUME_REVERSE_PROXY_PORT}
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Then merge `server/compose.yml` (the sync and blobs services) into the same
file, and add to the server `.env`:

```sh
MITSUME_SYNC_VOLUME=...   # host dir for the sync SQLite file — uid 1000 writable
MITSUME_BLOBS_VOLUME=...  # host dir for the image blobs — uid 1000 writable
```

## 2. Host Caddyfile site block

```caddyfile
{$TAILNET_DOMAIN}.{$TAILNET_DNS_NAME}:{$MITSUME_REVERSE_PROXY_PORT} {
	# Notes doc sync (websocket). The client connects to bare /sync (no
	# trailing slash), which handle_path /sync/* would NOT match — hence the
	# explicit two-form matcher.
	@sync path /sync /sync/*
	handle @sync {
		uri strip_prefix /sync
		reverse_proxy mitsume-sync:1234
	}

	# Image blobs by SHA-256. Immutable Cache-Control is set by the blobs
	# container itself (only on files that exist — never on 404s).
	handle_path /blobs/* {
		request_body {
			max_size 64MB
		}
		reverse_proxy mitsume-blobs:8080
	}

	handle {
		reverse_proxy mitsume:80
	}
}
```

## 3. Verify after deploy

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://<host>:<port>/              # 200 (app)
curl -s -o /dev/null -w '%{http_code}\n' https://<host>:<port>/sync/health   # 200

H=$(printf 'notes-verify' | shasum -a 256 | cut -d' ' -f1)
printf 'notes-verify' | curl -s -o /dev/null -w '%{http_code}\n' \
  -X PUT --data-binary @- https://<host>:<port>/blobs/$H                     # 201
curl -s https://<host>:<port>/blobs/$H                                       # notes-verify
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  https://<host>:<port>/blobs/$H                                             # 204
```

If `/sync/health` returns the app's HTML shell rather than `200` JSON, the
`@sync` matcher is missing or sits *after* the catch-all `handle` — the static
server answers every unmatched path with `index.html`, so a mis-ordered block
fails silently rather than 404ing.

Backup = your existing volume-snapshot routine should cover
`MITSUME_SYNC_VOLUME` (one SQLite file) and `MITSUME_BLOBS_VOLUME` (flat files;
restore = copy back). **These volumes are the only copy of your notes** — the
canvas is local-first, but a device holds a replica, not the archive.

## Android APK

Shipped as its own pipeline: CI builds the APK unsigned, signing + publishing
happen locally, Obtainium tracks the GitHub Releases feed. Full flow in
`docs/Release.md`.

Note that CI bakes no `EXPO_PUBLIC_SYNC_URL`/`EXPO_PUBLIC_BLOBS_URL`, so the
Android canvas is **local-only** — it does not sync. Web derives both from the
page origin and is unaffected. See `app/.env.example`.

## Local web dev (same-origin without Docker)

Use `tooling/dev-proxy/Caddyfile` (see its header comment): Metro on `:8081`
plus a local notes backend (sync + blobs containers built from `server/`) under
`http://localhost:8880/sync` and `/blobs/`.

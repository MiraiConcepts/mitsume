# Static web image: bun build → Caddy file server. Build context = app/.
#
#   docker build -t ghcr.io/miraiconcepts/mitsume:latest app/
#
# CREDENTIAL-FREE by design: the notes backend is authless behind the tailnet
# (see docs/Deploy.md), and nothing is baked here at all — the client derives
# /sync and /blobs/ from the page origin at runtime, so one image works on any
# host and the static-export prerender stays consistent with the client.

# ---- build ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
# patchedDependencies (bun patch) must be present at install time
COPY patches ./patches
RUN bun install --frozen-lockfile
COPY . .

ENV CI=1
RUN bunx expo export --platform web
# Version stamp for the web app's silent-reload check (use-silent-reload.web.ts)
RUN bun --eval 'require("fs").writeFileSync("dist/version.json", JSON.stringify({ version: require("./app.json").expo.version }))'

# ---- serve ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80

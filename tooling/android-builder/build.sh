#!/usr/bin/env bash
# Build the signed release APK in Docker (no host toolchain). See docs/Release.md.
#   ./tooling/android-builder/build.sh   → dist-apk/mitsume-v<version>.apk
set -euo pipefail
cd "$(dirname "$0")/../.."

KEYS_DIR="${MITSUME_KEYS_DIR:-$HOME/.mitsume-keys}"
ENV_FILE=tooling/android-builder/.env
IMAGE=mitsume-android-builder:local

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "==> building derived builder image (one-time)"
  docker build --platform linux/amd64 -t "$IMAGE" tooling/android-builder
fi

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — copy .env.example and fill it in"; exit 1; }
[ -f "$KEYS_DIR/release.keystore" ] || { echo "missing $KEYS_DIR/release.keystore — see docs/Release.md (one-time keygen)"; exit 1; }
[ -f "$KEYS_DIR/keystore.properties" ] || { echo "missing $KEYS_DIR/keystore.properties"; exit 1; }

VERSION=$(bun -e 'console.log(JSON.parse(require("fs").readFileSync("app/app.json","utf8")).expo.version)')
echo "==> building mitsume v$VERSION (amd64 container under Rosetta)"

docker run --rm --platform linux/amd64 \
  -v "$PWD/app:/work/app" \
  -v mitsume-node-modules:/work/app/node_modules \
  -v "$PWD/tooling/android-builder:/work/tools:ro" \
  -v "$KEYS_DIR:/keys:ro" \
  -v mitsume-gradle:/root/.gradle \
  --env-file "$ENV_FILE" \
  "$IMAGE" bash /work/tools/container-build.sh

mkdir -p dist-apk
cp app/android/app/build/outputs/apk/release/app-release.apk "dist-apk/mitsume-v$VERSION.apk"
ls -lh "dist-apk/mitsume-v$VERSION.apk"

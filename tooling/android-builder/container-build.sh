#!/usr/bin/env bash
# Runs INSIDE reactnativecommunity/react-native-android (invoked by build.sh).
set -euo pipefail
cd /work/app

# JS toolchain must be native arm64 (see Dockerfile) — emulated Node segfaults on codegen.
echo "==> node: $(node --version) $(node -e 'process.stdout.write(process.arch)') (expect arm64)"

echo "==> deps"
npm install -g bun >/dev/null 2>&1
bun install --frozen-lockfile

echo "==> expo prebuild (regenerates android/)"
rm -rf android
bunx expo prebuild --platform android --no-install

echo "==> wire release signing"
node /work/tools/patch-signing.mjs android/app/build.gradle
# keystore.properties: keyAlias / storePassword / keyPassword (key=value lines)
set -a; source /keys/keystore.properties; set +a
export MITSUME_STORE_FILE=/keys/release.keystore
export MITSUME_KEY_ALIAS="$keyAlias"
export MITSUME_STORE_PASSWORD="$storePassword"
export MITSUME_KEY_PASSWORD="$keyPassword"

echo "==> install Maven Central mirror fallback (Sonatype 403s some networks)"
mkdir -p ~/.gradle/init.d
cp /work/tools/mirror.gradle ~/.gradle/init.d/mirror.gradle

echo "==> gradle assembleRelease (universal APK)"
cd android
./gradlew :app:assembleRelease --no-daemon -x lint

echo "==> verify signature"
APK=app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs "$APK" | head -4
echo "==> done: $APK"

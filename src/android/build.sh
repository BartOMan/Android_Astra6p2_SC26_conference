#!/usr/bin/env bash
# Build the universal offline APK with the Android SDK, with no Gradle dependencies.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}
BT=${BUILD_TOOLS_DIR:-$SDK/build-tools/35.0.0}
PLATFORM=${ANDROID_JAR:-$SDK/platforms/android-35/android.jar}
APP=${APP_DIR:-$ROOT/app}
OUT=${1:-$ROOT/dist/SC26-Field-Guide.apk}
OUT=$(realpath -m "$OUT")
KEYSTORE=${GUIDE_KEYSTORE:-${XDG_DATA_HOME:-$HOME/.local/share}/sc26-fieldguide/signing.p12}
export GUIDE_SIGN_PASSWORD=${GUIDE_SIGN_PASSWORD:-fieldguide-local}
if [[ ! -x "$BT/aapt2" || ! -f "$PLATFORM" || ! -f "$APP/index.html" ]]; then
    echo "Install Android SDK Platform 35 and Build Tools 35.0.0, and place the guide in app/." >&2
    exit 1
fi
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/classes" "$WORK/assets/www" "$WORK/dex" "$(dirname "$OUT")"
cp -RL "$APP/." "$WORK/assets/www/"
"$BT/aapt2" compile --dir "$HERE/res" -o "$WORK/resources.zip"
"$BT/aapt2" link -I "$PLATFORM" --manifest "$HERE/AndroidManifest.xml" \
    -A "$WORK/assets" -o "$WORK/base.apk" "$WORK/resources.zip"
SOURCES=("$HERE"/src/org/sc26/fieldguide/*.java)
if [[ -n ${ECJ_JAR:-} ]]; then
    java -jar "$ECJ_JAR" -8 -proc:none -nowarn -bootclasspath "$PLATFORM" -d "$WORK/classes" "${SOURCES[@]}"
else
    javac -source 8 -target 8 -bootclasspath "$PLATFORM" -d "$WORK/classes" "${SOURCES[@]}"
fi
(cd "$WORK/classes" && zip -qr "$WORK/classes.jar" .)
"$BT/d8" --lib "$PLATFORM" --min-api 26 --output "$WORK/dex" "$WORK/classes.jar"
(cd "$WORK/dex" && zip -q "$WORK/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"
if [[ ! -f "$KEYSTORE" ]]; then
    (umask 077
     mkdir -p "$(dirname "$KEYSTORE")"
     keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -alias fieldguide -keyalg RSA \
        -keysize 3072 -validity 3650 -dname "CN=SC26 Field Guide" -storepass:env GUIDE_SIGN_PASSWORD)
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias fieldguide --ks-pass env:GUIDE_SIGN_PASSWORD \
    --v4-signing-enabled false --out "$WORK/signed.apk" "$WORK/aligned.apk"
"$BT/apksigner" verify --verbose "$WORK/signed.apk"
"$BT/zipalign" -c -p 4 "$WORK/signed.apk"
mv -f "$WORK/signed.apk" "$OUT"
echo "$OUT"

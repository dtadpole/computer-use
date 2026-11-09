#!/usr/bin/env bash
# Build CUHelper.app from the Swift sources with swiftc (Command Line Tools only, no Xcode project) and sign it.
#
#   bash build.sh <output-dir>
#
# Writes <output-dir>/CUHelper.app with Info.plist (bundle id com.reflection.cu-helper, LSUIElement) and signs it
# with the identity named by CU_HELPER_IDENTITY, or ad hoc ("-") when it is unset. TCC keys an ad-hoc grant to the
# code hash, which every rebuild changes (measured), so an ad-hoc helper loses its grants on each rebuild; a stable
# identity is the owner's choice (Q-D2). This script never touches the keychain itself, never runs the helper and
# never opens the bundle. If signing fails it removes the bundle, so a half-built helper never sits where the owner
# grants (its grant would be keyed to a hash the signed build replaces).
set -euo pipefail

BUNDLE_ID="com.reflection.cu-helper"   # keep equal to HelperIdentity.bundleId and launch.mjs BUNDLE_ID
BUNDLE_NAME="CUHelper"
VERSION="0.2.62"
MIN_MACOS="14.0"                        # SCScreenshotManager

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: bash build.sh <output-dir>" >&2
  exit 2
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$1"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
app="$out/$BUNDLE_NAME.app"

# Only ever replace a previous build of this bundle at this exact path.
if [ -e "$app" ]; then
  if [ ! -f "$app/Contents/Info.plist" ] || ! grep -q "<string>$BUNDLE_ID</string>" "$app/Contents/Info.plist"; then
    echo "build.sh: $app exists and is not a CUHelper build; refusing to replace it" >&2
    exit 1
  fi
  rm -rf "${app:?}"
fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

arch="$(uname -m)"
sdk="$(xcrun --show-sdk-path 2>/dev/null || true)"
sources=("$here"/Sources/*.swift)

swiftc \
  -O \
  -swift-version 5 \
  -target "$arch-apple-macosx$MIN_MACOS" \
  ${sdk:+-sdk "$sdk"} \
  -module-name CUHelper \
  -framework AppKit -framework ApplicationServices -framework CoreGraphics \
  -framework ScreenCaptureKit -framework ImageIO -framework Security -framework Carbon \
  -o "$app/Contents/MacOS/$BUNDLE_NAME" \
  "${sources[@]}"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>$BUNDLE_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>CU Helper</string>
  <key>CFBundleExecutable</key>
  <string>$BUNDLE_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_MACOS</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSScreenCaptureUsageDescription</key>
  <string>CU Helper captures only the apps you approve for a computer-use run.</string>
  <key>NSAccessibilityUsageDescription</key>
  <string>CU Helper reads and acts on only the apps you approve for a computer-use run.</string>
</dict>
</plist>
PLIST
plutil -lint "$app/Contents/Info.plist" >/dev/null

identity="${CU_HELPER_IDENTITY:-}"
if [ -z "$identity" ]; then
  identity="-"
  echo "build.sh: warning: CU_HELPER_IDENTITY is unset, signing ad hoc; TCC keys an ad-hoc grant to the code hash, so this build loses any Screen Recording and Accessibility grant on every rebuild" >&2
fi
# codesign's own message still reaches the terminal; a copy says which hint fits.
sign_log="$(mktemp /tmp/cu-helper-codesign-XXXXXX)"
if ! codesign --force --sign "$identity" --identifier "$BUNDLE_ID" --options runtime --timestamp=none "$app" 2> >(tee "$sign_log" >&2) || ! codesign --verify --strict "$app"; then
  rm -rf "$app"
  sleep 0.1   # let the tee finish writing the copy
  if [ "$identity" = "-" ]; then
    echo "build.sh: codesign failed; removed the unsigned $app" >&2
  elif grep -q "errSecInternalComponent" "$sign_log"; then
    # The certificate is there, but codesign could not show the keychain's prompt for its key: no GUI session (SSH) or
    # a locked keychain.
    echo "build.sh: codesign could not sign with '$identity'; removed the unsigned $app so it cannot be granted by mistake. codesign could not reach the keychain prompt for the key (errSecInternalComponent): run install.sh in Terminal inside this Mac's own desktop session (over Screen Sharing, not SSH), run 'security unlock-keychain' first if the login keychain is locked, and choose Always Allow when codesign asks for the key" >&2
  else
    echo "build.sh: codesign could not sign with '$identity'; removed the unsigned $app so it cannot be granted by mistake. A Code Signing certificate of exactly that name must be in this user's login keychain on this Mac (Keychain Access > Certificate Assistant > Create a Certificate: Self Signed Root, Code Signing); choose Always Allow when codesign asks for the key" >&2
  fi
  rm -f "$sign_log"
  exit 1
fi
rm -f "$sign_log"

echo "$app"

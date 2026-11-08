#!/usr/bin/env bash
# Install CUHelper.app at the fixed path the owner grants, then check it - the owner's step 1 to 2 of the TCC request.
#
#   bash install.sh [--cu-home <absolute dir>] [--no-open]
#
# Builds with build.sh into <CU_HOME>/helper (CU_HOME defaults to $CU_HOME, else ~/.computer-use), signed with
# CU_HELPER_IDENTITY when it is set (the owner's choice, Q-D2; codesign may then ask the keychain once), ad hoc
# otherwise. If a previous build sat there with a different designated requirement, it says that grants given to the
# old build do not carry over. Then it runs the helper's prompt-free self-test - through LaunchServices
# (`open -g -n -a`), as the driver launches it, or directly with --no-open - and prints the identity and the four
# preflights. It grants nothing, prompts for nothing and never starts a run.
set -euo pipefail

usage() {
  echo "usage: bash install.sh [--cu-home <absolute dir>] [--no-open]" >&2
  exit 2
}

cu_home="${CU_HOME:-$HOME/.computer-use}"
use_open=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cu-home) [ "$#" -ge 2 ] || usage; cu_home="$2"; shift 2 ;;
    --no-open) use_open=0; shift ;;
    -h|--help) usage ;;
    *) echo "install.sh: unknown argument $1" >&2; usage ;;
  esac
done
case "$cu_home" in
  /*) ;;
  *) echo "install.sh: --cu-home must be an absolute path" >&2; exit 2 ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$cu_home/helper"
app="$target/CUHelper.app"
mkdir -p "$target"
chmod 700 "$cu_home" "$target"

before=""
if [ -d "$app" ]; then
  before="$(codesign -d -r- "$app" 2>&1 | sed -n 's/^#* *designated => //p' || true)"
fi

bash "$here/build.sh" "$target" >/dev/null

after="$(codesign -d -r- "$app" 2>&1 | sed -n 's/^#* *designated => //p')"
echo "installed: $app"
echo "designated requirement: $after"
if [ -n "$before" ] && [ "$before" != "$after" ]; then
  echo "install.sh: note: the designated requirement changed; Screen Recording and Accessibility granted to the previous build do not apply to this one - turn them off and on again for CUHelper, or sign with a stable identity (CU_HELPER_IDENTITY)" >&2
fi

report="$(mktemp -d /tmp/cu-helper-install-XXXXXX)/selftest.json"
if [ "$use_open" -eq 1 ]; then
  /usr/bin/open -g -n -a "$app" --args --selftest --out "$report"
  for _ in $(seq 1 50); do
    [ -s "$report" ] && break
    sleep 0.2
  done
else
  "$app/Contents/MacOS/CUHelper" --selftest --out "$report"
fi
if [ ! -s "$report" ]; then
  echo "install.sh: the self-test wrote no report" >&2
  exit 1
fi

/usr/bin/python3 - "$report" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
print("self-test: %s (%d checks, %d capability calls)" % (report["selftest"], report["checks"], report["capabilityCalls"]))
print("version: %s, running as %s, launched by launchd: %s" % (report["helperVersion"], report["runningBundleId"], report["launchedByLaunchd"]))
print("signing: %s" % ("ad hoc" if report["signing"].get("adhoc") else "stable identity"))
print("grants: " + ", ".join("%s %s" % (name, "on" if value else "off") for name, value in sorted(report["preflight"].items())))
sys.exit(0 if report["selftest"] == "pass" else 1)
PY

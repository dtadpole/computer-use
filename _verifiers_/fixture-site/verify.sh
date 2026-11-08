#!/bin/sh
# The fixture-site verifier: runs its checks through browser-use's shared runner (vendored under _vendor_/browser-use, not
# copied), which keeps the verdict contract - 0 holds, 1 fails, 3 could not be judged. A closed
# memory gate (D-005) or a missing Chrome is a 3, never a pass.
#
#   ./verify.sh            every check, with the verdict
#   ./verify.sh --list     the check names, with what was unjudged and why
#   ./verify.sh --json     one parseable object
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
runner="$here/../../_vendor_/browser-use/_tools_/verify-runner/run.mjs"
status=0
for check in "$here"/check*.mjs; do
  [ -f "$check" ] || continue
  node "$runner" "$check" "$@" || {
    code=$?
    if [ "$code" -eq 1 ] || [ "$status" -eq 0 ]; then status=$code; fi
  }
done
exit "$status"

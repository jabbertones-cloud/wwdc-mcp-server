#!/bin/bash
# Install native weekly scheduler on the M1 host serving both MCP endpoints.
set -euo pipefail
if [ "$(uname -s)" != "Darwin" ]; then echo "macOS only" >&2; exit 78; fi
ROOT="$(cd -P "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/weekly-refresh-macos.sh"
"$SCRIPT" --check
PLIST="$HOME/Library/LaunchAgents/com.smat.wwdc-weekly-ingest.plist"
DATA="$HOME/Library/Application Support/wwdc-mcp-server"
mkdir -p "$(dirname "$PLIST")" "$DATA"
python3 - "$PLIST" "$SCRIPT" "$DATA" <<'PY'
import os,plistlib,sys,tempfile
plist, script, data = sys.argv[1:]
data_obj = {
    "Label":"com.smat.wwdc-weekly-ingest",
    "ProgramArguments":["/bin/bash",script],
    "LimitLoadToSessionType":"Background",
    "ProcessType":"Background",
    "RunAtLoad":False,
    "StartCalendarInterval":{"Weekday":0,"Hour":23,"Minute":0},
    "StandardOutPath":os.path.join(data,"weekly-refresh.stdout.log"),
    "StandardErrorPath":os.path.join(data,"weekly-refresh.stderr.log"),
}
fd, temp = tempfile.mkstemp(prefix=".wwdc-weekly-plist-",dir=os.path.dirname(plist))
try:
    with os.fdopen(fd,"wb") as f: plistlib.dump(data_obj,f)
    os.chmod(temp,0o644)
    os.replace(temp,plist)
except BaseException:
    try: os.unlink(temp)
    except FileNotFoundError: pass
    raise
PY
plutil -lint "$PLIST"
if launchctl print "user/$(id -u)/com.smat.wwdc-weekly-ingest" >/dev/null 2>&1; then
  launchctl bootout "user/$(id -u)/com.smat.wwdc-weekly-ingest"
fi
launchctl bootstrap "user/$(id -u)" "$PLIST"
launchctl print "user/$(id -u)/com.smat.wwdc-weekly-ingest" | head -45
echo "[weekly-ingest] scheduled; Sunday 23:00 America/Phoenix = Monday 06:00 UTC"

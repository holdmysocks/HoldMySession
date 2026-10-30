#!/bin/bash

# Starts HoldMySession from this checkout when a session starts, if it is not already running.
# Uses the built app in apps/web (run `npm run build` there first), never npm or npx.
# Runs in the background and logs to ~/.holdmysession/dashboard.log. Idempotent, and always exits 0.

PORT="${HOLDMYSESSION_PORT:-3000}"
APP="$CLAUDE_PROJECT_DIR/apps/web"
LOG_DIR="${HOLDMYSESSION_DIR:-$HOME/.holdmysession}"

# Already running: nothing to do.
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  exit 0
fi

# Not built yet: say so in the log and leave it to the user.
if [ ! -f "$APP/dist/server/server.js" ]; then
  mkdir -p "$LOG_DIR"
  echo "$(date) HoldMySession is not built. Run 'npm run build' in apps/web." >> "$LOG_DIR/dashboard.log"
  exit 0
fi

mkdir -p "$LOG_DIR"
nohup node "$APP/bin/cli.mjs" --port "$PORT" --open >> "$LOG_DIR/dashboard.log" 2>&1 &
disown

# The hook must finish within its timeout.
exit 0

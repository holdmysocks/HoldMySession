---
name: dashboard
description: Open HoldMySession in the browser. Starts it from this checkout first if it is not already running.
user-invocable: true
---

# Open HoldMySession

## Steps

### 1. Check if it is running

```bash
(exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && echo running || echo stopped
```

If it prints `running`, skip to step 4.

### 2. Check it is built

The app is run from this checkout, never from npm. It needs `apps/web/dist/server/server.js`.

```bash
test -f apps/web/dist/server/server.js && echo built || echo "not built"
```

If it is not built, build it:

```bash
cd apps/web && npm run build
```

### 3. Start it

```bash
mkdir -p ~/.holdmysession
nohup node apps/web/bin/cli.mjs --port 3000 >> ~/.holdmysession/dashboard.log 2>&1 & disown
```

Wait until port 3000 answers (try for up to 15 seconds):

```bash
for i in $(seq 1 15); do (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && break; sleep 1; done
```

### 4. Open it in the browser

```bash
open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || start http://localhost:3000
```

Tell the user HoldMySession is open at http://localhost:3000.

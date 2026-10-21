#!/bin/bash
# NovelStudio launcher: double-click in Finder.
# Starts the server if it is not already running, then opens the app in your browser.
# The server runs in this window; press Ctrl+C (or close the window) to stop it.
#
# Environment (optional): PORT (default 4317), NOVEL_DATA_DIR (default: the real data folder).

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-4317}"
URL="http://127.0.0.1:${PORT}"

pause_on_error() {
  echo
  read -r -p "Press Return to close this window." _
  exit 1
}

is_running() {
  curl -fs --max-time 2 "${URL}/api/health" 2>/dev/null | grep -q '"status":"ok"'
}

if is_running; then
  echo "NovelStudio is already running. Opening ${URL}"
  open "${URL}"
  exit 0
fi

# A window opened from Finder may not have the PATH of your usual terminal.
if ! command -v node >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.volta/bin:${PATH}"
  # shellcheck disable=SC1091
  [ -s "${HOME}/.nvm/nvm.sh" ] && . "${HOME}/.nvm/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 24 or newer, then try again."
  pause_on_error
fi
if [ ! -d node_modules ]; then
  echo "Dependencies are not installed. Run 'npm install' in $(pwd) first."
  pause_on_error
fi

# Build when there is no build yet or the sources are newer than it.
if [ ! -f dist/server/index.js ] || [ -n "$(find src index.html public -newer dist/server/index.js -print -quit 2>/dev/null)" ]; then
  echo "Building NovelStudio…"
  npm run build || pause_on_error
fi

# Open the browser as soon as the server answers.
(
  for _ in $(seq 1 120); do
    if is_running; then
      open "${URL}"
      exit 0
    fi
    sleep 0.5
  done
) &

echo "Starting NovelStudio on ${URL} (Ctrl+C to stop)"
exec npm start

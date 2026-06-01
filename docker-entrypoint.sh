#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/data}"
CODEX_HOME="${CODEX_HOME:-$DATA_DIR/codex}"
APP_UID="${PUID:-1000}"
APP_GID="${PGID:-1000}"

mkdir -p "$DATA_DIR" "$CODEX_HOME"

if [ "$(id -u)" = "0" ]; then
  if chown -R "$APP_UID:$APP_GID" "$DATA_DIR" 2>/dev/null; then
    :
  else
    echo "WARN: failed to chown $DATA_DIR to $APP_UID:$APP_GID; testing write access as root." >&2
  fi

  if gosu "$APP_UID:$APP_GID" sh -c 'touch "$DATA_DIR/.write-test" && rm -f "$DATA_DIR/.write-test"' 2>/dev/null; then
    exec gosu "$APP_UID:$APP_GID" "$@"
  fi

  echo "WARN: $DATA_DIR is not writable by $APP_UID:$APP_GID; running as root fallback." >&2
fi

exec "$@"

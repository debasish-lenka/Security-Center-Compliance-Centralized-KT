#!/bin/sh
# Creates a self-signed certificate for PUBLIC_HOST (an IP or a name) if none exists yet,
# or when PUBLIC_HOST changed. Runs from nginx's /docker-entrypoint.d before nginx starts.
set -e
DIR=/etc/nginx/certs
HOST="${PUBLIC_HOST:-localhost}"
mkdir -p "$DIR"

if [ -f "$DIR/server.crt" ] && [ "$(cat "$DIR/host.txt" 2>/dev/null)" = "$HOST" ]; then
  exit 0
fi

case "$HOST" in
  *[a-zA-Z]*) SAN="DNS:$HOST,DNS:localhost" ;;
  *)          SAN="IP:$HOST,DNS:localhost" ;;
esac

openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$DIR/server.key" -out "$DIR/server.crt" \
  -subj "/CN=$HOST" -addext "subjectAltName=$SAN"
chmod 600 "$DIR/server.key"
echo "$HOST" > "$DIR/host.txt"
echo "Generated self-signed certificate for $HOST"

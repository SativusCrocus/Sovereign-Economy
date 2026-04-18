#!/usr/bin/env bash
# deploy/tls/generate-cert.sh
# Generates a self-signed TLS cert for mcp-gateway. Dev use only —
# replace with a real cert (cert-manager, Let's Encrypt, Akash ingress) in prod.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")" && pwd)"
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out    "$CERT_DIR/server.crt" \
  -subj   "/C=US/ST=CA/L=SF/O=DAES/CN=mcp-gateway" \
  -addext "subjectAltName=DNS:mcp-gateway,DNS:localhost,IP:127.0.0.1"
chmod 600 "$CERT_DIR/server.key"
echo "wrote $CERT_DIR/server.{crt,key}"

#!/usr/bin/env bash
# deploy/tls/generate-cert.sh
# Generates a self-signed TLS cert for mcp-gateway.
#
# DEV USE ONLY. Production deployments must terminate TLS with a real cert:
#   - docker compose: use `deploy/docker-compose.prod.yaml` (Caddy + ACME LE)
#   - Kubernetes:     use cert-manager with a Let's Encrypt ClusterIssuer
#   - Akash:          providers terminate external TLS at their ingress
#                     (traefik + LE); this cert is only for pod-to-pod links,
#                     and those should migrate to an internal PKI / service
#                     mesh before any production traffic.
#
# See docs/audit-notes.md "Production hardening" and README.md for the full
# switchover steps.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")" && pwd)"
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out    "$CERT_DIR/server.crt" \
  -subj   "/C=US/ST=CA/L=SF/O=DAES/CN=mcp-gateway" \
  -addext "subjectAltName=DNS:mcp-gateway,DNS:localhost,IP:127.0.0.1"
chmod 600 "$CERT_DIR/server.key"
echo "wrote $CERT_DIR/server.{crt,key}"

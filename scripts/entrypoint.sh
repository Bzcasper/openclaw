#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${TS_AUTHKEY:-}" ]]; then
  mkdir -p /data/tailscale
  if [[ "${TS_RESET:-false}" == "true" ]]; then
    rm -f /data/tailscale/tailscaled.state
  fi
  # Start tailscaled in userspace networking mode
  /usr/sbin/tailscaled --tun=userspace-networking --state=/data/tailscale/tailscaled.state --socket=/tmp/tailscaled.sock &
  for i in $(seq 1 20); do
    if /usr/bin/tailscale --socket=/tmp/tailscaled.sock status >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done

  TS_FLAGS=("--auth-key=${TS_AUTHKEY}" "--hostname=${TS_HOSTNAME:-openclaw-fly}" "--accept-dns=false")
  if [[ -n "${TS_TAGS:-}" ]]; then
    TS_FLAGS+=("--advertise-tags=${TS_TAGS}")
  fi
  if [[ "${TS_RESET:-false}" == "true" ]]; then
    TS_FLAGS+=("--reset")
  fi
  if [[ -n "${TS_EXTRA_ARGS:-}" ]]; then
    # shellcheck disable=SC2206
    TS_FLAGS+=(${TS_EXTRA_ARGS})
  fi

  /usr/bin/tailscale --socket=/tmp/tailscaled.sock up "${TS_FLAGS[@]}" || true

  if [[ -n "${TS_SERVE:-}" ]]; then
    # Best-effort only; do not block app startup on serve config errors.
    /usr/bin/tailscale --socket=/tmp/tailscaled.sock serve ${TS_SERVE} || true
  fi
fi

if id -u node >/dev/null 2>&1; then
  # Create data directories with proper permissions for node user
  mkdir -p /data/cron /data/devices /data/sessions /data/credentials /data/tailscale
  chown -R node:node /data
  exec runuser -u node -- "$@"
fi

exec "$@"

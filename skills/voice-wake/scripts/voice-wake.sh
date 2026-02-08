#!/bin/bash
# OpenClaw Voice Wake Agent — launcher
# Usage: ./scripts/voice-wake.sh [--debug] [--device N] [--voice MODEL] [--phrase WORD]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$HOME/.openclaw/voice-wake-venv"
AGENT_SCRIPT="$SCRIPT_DIR/voice-wake.py"
ENV_FILE="$HOME/.openclaw/.env"

# ── Load env vars from ~/.openclaw/.env ───────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── Parse CLI flags ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      export VOICE_WAKE_DEBUG=1
      shift
      ;;
    --device)
      export VOICE_WAKE_DEVICE="$2"
      shift 2
      ;;
    --voice)
      export VOICE_WAKE_VOICE="$2"
      shift 2
      ;;
    --phrase)
      export VOICE_WAKE_PHRASE="$2"
      shift 2
      ;;
    --install-deps)
      "$SCRIPT_DIR/install-deps.sh"
      exit 0
      ;;
    --help|-h)
      cat <<'EOF'
OpenClaw Voice Wake Agent

Usage:
  ./scripts/voice-wake.sh [OPTIONS]

Options:
  --debug              Enable verbose transcript logging
  --device N           Audio input device index (see: python3 -m sounddevice)
  --voice MODEL        Deepgram TTS voice (default: aura-2-thalia-en)
  --phrase WORD        Wake phrase (default: trap god activate)
  --install-deps       Install Python dependencies and exit
  -h, --help           Show this help

Environment (auto-loaded from ~/.openclaw/.env):
  DEEPGRAM_API_KEY     Required
  OPENCLAW_BIN         Path to openclaw binary (auto-detected)
  VOICE_WAKE_DEBUG     Set to 1 for verbose logging
  VOICE_WAKE_DEVICE    Audio device index
  VOICE_WAKE_VOICE     TTS voice model
  VOICE_WAKE_PHRASE    Activation phrase
  VOICE_WAKE_PERSONA   Custom system persona
  VOICE_WAKE_MEMORY_TURNS  Recent conversation turns to inject (default: 20)

List audio devices:
  python3 -m sounddevice

Example:
  # First run: install dependencies
  ./voice-wake.sh --install-deps

  # Then run the agent
  ./voice-wake.sh

  # Or with options
  ./voice-wake.sh --debug --device 14 --voice aura-2-thalia-en
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
  esac
done

# ── Ensure venv exists ────────────────────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
  echo "⚙️  Creating Python venv at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip setuptools wheel
  "$VENV_DIR/bin/pip" install --quiet deepgram-sdk sounddevice numpy
  echo "✓ Venv ready"
fi

# ── Quick dep check ───────────────────────────────────────────────────────────
if ! "$VENV_DIR/bin/python" -c "import deepgram, sounddevice, numpy" 2>/dev/null; then
  echo "⚙️  Installing missing deps..."
  "$VENV_DIR/bin/pip" install --quiet deepgram-sdk sounddevice numpy
fi

# ── Preflight ─────────────────────────────────────────────────────────────────
if [[ -z "${DEEPGRAM_API_KEY:-}" ]]; then
  echo "✗ DEEPGRAM_API_KEY not set. Add it to $ENV_FILE or export it." >&2
  exit 1
fi

if [[ ! -f "$AGENT_SCRIPT" ]]; then
  echo "✗ Agent script not found: $AGENT_SCRIPT" >&2
  exit 1
  exit 1
fi

if ! command -v mpv &>/dev/null; then
  echo "✗ mpv not found. Please install it (e.g. sudo apt install mpv / brew install mpv)" >&2
  exit 1
fi

# ── Preflight: check OpenClaw binary ──────────────────────────────────────────
if [[ -z "${OPENCLAW_BIN:-}" ]]; then
  # Try to find local binary relative to this script
  # script is in skills/voice-wake/scripts/
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  if [[ -f "$PROJECT_ROOT/openclaw.mjs" ]]; then
    OPENCLAW_BIN="$PROJECT_ROOT/openclaw.mjs"
  elif [[ -f "./openclaw.mjs" ]]; then
    OPENCLAW_BIN="./openclaw.mjs"
  else
    OPENCLAW_BIN="openclaw"
  fi
fi
export OPENCLAW_BIN

if [[ "$OPENCLAW_BIN" == "openclaw" ]] && ! command -v openclaw &>/dev/null; then
  echo "⚠ Warning: openclaw binary not found in PATH" >&2
  echo "   The agent might fail to send messages." >&2
elif [[ "$OPENCLAW_BIN" != "openclaw" ]] && [[ ! -x "$OPENCLAW_BIN" ]]; then
   # Ensure it's executable
   chmod +x "$OPENCLAW_BIN"
fi

# ── Run ───────────────────────────────────────────────────────────────────────
exec "$VENV_DIR/bin/python" "$AGENT_SCRIPT"

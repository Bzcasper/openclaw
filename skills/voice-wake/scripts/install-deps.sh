#!/bin/bash
# Install dependencies for the voice-wake skill
# Usage: ./install-deps.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$HOME/.openclaw/voice-wake-venv"

echo "⚙️  Setting up voice-wake agent..."
echo ""

# Check for required system binaries
echo "[1/4] Checking system dependencies..."
for cmd in aplay mpv python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "✗ Missing: $cmd"
    case "$cmd" in
      aplay)
        echo "  Install: sudo apt install alsa-utils"
        ;;
      mpv)
        echo "  Install: sudo apt install mpv"
        ;;
      python3)
        echo "  Install: sudo apt install python3 python3-venv"
        ;;
    esac
    exit 1
  fi
done
echo "✓ System dependencies OK"
echo ""

# Create Python venv
echo "[2/4] Creating Python virtual environment at $VENV_DIR..."
if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
  echo "✓ Venv created"
else
  echo "✓ Venv already exists"
fi
echo ""

# Install Python packages
echo "[3/4] Installing Python packages..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip setuptools wheel
"$VENV_DIR/bin/pip" install --quiet \
  deepgram-sdk \
  sounddevice \
  numpy
echo "✓ Python packages installed"
echo ""

# Verify installation
echo "[4/4] Verifying installation..."
if "$VENV_DIR/bin/python" -c "import deepgram, sounddevice, numpy" 2>/dev/null; then
  echo "✓ All packages verified"
else
  echo "✗ Package verification failed"
  exit 1
fi
echo ""

echo "✅ voice-wake agent is ready!"
echo ""
echo "Next steps:"
echo "  1. Set DEEPGRAM_API_KEY in ~/.openclaw/.env"
echo "  2. Run: $SCRIPT_DIR/voice-wake.py"
echo "  3. Or with debug: VOICE_WAKE_DEBUG=1 $SCRIPT_DIR/voice-wake.py"
echo ""

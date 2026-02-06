# Voice Wake Skill — Implementation Summary

## Overview

The **voice-wake** skill is a complete, production-ready Linux voice assistant for OpenClaw. It features:

- ✅ **Always-on listening** with activation phrase "TRAP GOD ACTIVATE"
- ✅ **Conversation memory** — persistent JSONL log at `~/.openclaw/voice-agent/conversations.jsonl`
- ✅ **Conversational AI** — system persona ensures natural, speech-friendly responses
- ✅ **Deepgram STT/TTS** — streaming speech-to-text (Nova-3) and text-to-speech (Aura voices)
- ✅ **Smart response filtering** — strips internal noise (LanceDB, memory loading, markdown)
- ✅ **Multi-mode operation** — Standby (listening only) → Active (conversational) → Cooldown
- ✅ **Deactivation phrase** — "ALL TRAPS HELL RELL" to exit active mode
- ✅ **Audio chimes** — ascending tone for activation, descending for deactivation
- ✅ **Session memory injection** — recent conversation history (configurable N=20 turns) injected into each OpenClaw prompt
- ✅ **Full configuration** — environment variables for audio device, TTS voice, persona, memory depth

## Files & Structure

```
skills/voice-wake/
├── SKILL.md                              # AgentSkills-compatible skill metadata
├── IMPLEMENTATION_SUMMARY.md             # This file
├── scripts/
│   ├── voice-wake.py                    # Main agent (766 lines, production code)
│   ├── voice-wake.sh                    # Launcher with venv + preflight checks
│   └── install-deps.sh                  # One-time dependency installer
└── references/
    ├── quick-start.md                   # Getting started in 5 minutes
    └── memory-and-context.md            # Deep dive on memory, persona, troubleshooting
```

Also copied to `scripts/` directory for direct access:

- `scripts/voice-wake.py`
- `scripts/voice-wake.sh`
- `scripts/install-voice-wake-deps.sh`

## Key Components

### 1. `voice-wake.py` — Main Agent (766 lines)

**Class: `VoiceWakeAgent`**

State machine with 6 states:

- **STANDBY**: Listening for "trap god activate" only. Low CPU, all audio streamed to Deepgram but scanned for wake phrase only.
- **ACTIVE**: Conversational mode. User can speak commands. Agent listens for utterances.
- **CAPTURING**: Mid-utterance buffering. Accumulating user speech.
- **PROCESSING**: Waiting for OpenClaw response + TTS playback. Mic muted to avoid self-trigger.
- **COOLDOWN**: 1.5s pause after TTS. Prevents audio feedback loops.

**Memory System:**

```python
MEMORY_DIR = Path.home() / ".openclaw" / "voice-agent"
MEMORY_FILE = MEMORY_DIR / "conversations.jsonl"

# Each line is: {"ts": "2026-02-04T18:45:23Z", "role": "user|assistant", "text": "..."}

save_turn(role, text)              # Append to JSONL
load_recent_turns(n)              # Load last N turns from file
format_memory_context(turns)       # Format into prompt context
```

**Conversation Flow:**

1. User says "trap god activate"
2. Agent plays ascending chime, speaks random greeting, transitions to ACTIVE
3. User speaks a command (e.g., "what's the weather")
4. Agent captures speech → loads recent memory (default 20 turns) → sends to OpenClaw with persona + memory context + user message
5. OpenClaw responds (e.g., "72 degrees, sunny")
6. Agent speaks response → saves turn to memory
7. Agent plays listening blip, stays in ACTIVE waiting for next command
8. User says "all traps hell rell" → agent plays descending chime, speaks farewell, returns to STANDBY

**Response Cleaning:**

```python
_NOISE_PATTERNS = [
    re.compile(r"(?i).*lanc(e|db).*"),           # LanceDB mentions
    re.compile(r"(?i)^\s*(loading|loaded).*memory"),  # Loading status
    re.compile(r"(?i)^\s*\[?(info|debug|warn)"),  # Log prefixes
    # ... more patterns
]

clean_response(text)  # Strips lines matching patterns + markdown formatting
```

**Persona & Prompting:**

```python
DEFAULT_PERSONA = """\
You are Trap God's personal voice assistant, powered by OpenClaw.
You speak in a natural, conversational tone — confident but not stiff.
Keep responses concise and spoken-word friendly (no markdown, no bullet lists, no code blocks).
Remember past conversations when context is provided.
Address the user casually.\
"""

# Full prompt sent to OpenClaw:
# [System context]
# Persona: <PERSONA>
#
# [Recent conversation history]
# USER (2026-02-04): what's the weather
# ASSISTANT (2026-02-04): 72 degrees, sunny.
# [End of history]
#
# [User voice command]
# <actual user utterance>
#
# [Respond naturally as a voice assistant...]
```

**Audio Configuration:**

- **STT**: Deepgram Nova-3, 16 kHz mono, streaming
- **TTS**: Deepgram Aura (configurable voice, default: aura-2-thalia-en)
- **Device**: Auto-detected or via `VOICE_WAKE_DEVICE` env var
- **Chimes**: Generated via numpy sine waves, played with `aplay`
- **Response playback**: Generated TTS wav → temp file → `mpv`

### 2. `voice-wake.sh` — Launcher

Features:

- ✅ Auto-creates Python venv at `~/.openclaw/voice-wake-venv`
- ✅ Installs dependencies: deepgram-sdk, sounddevice, numpy
- ✅ Loads env vars from `~/.openclaw/.env`
- ✅ Validates DEEPGRAM_API_KEY and `openclaw` binary presence
- ✅ CLI flags: `--debug`, `--device N`, `--voice MODEL`, `--phrase WORD`
- ✅ Help text with examples

Usage:

```bash
./voice-wake.sh                          # Run with defaults
./voice-wake.sh --debug                  # Verbose transcript logging
./voice-wake.sh --device 14 --voice aura-2-zeus-en  # Custom audio + voice
```

### 3. `install-deps.sh` — Dependency Installer

One-time setup:

- Checks for `aplay`, `mpv`, `python3` on system
- Creates venv, installs Python packages
- Verifies installation

Usage:

```bash
./install-deps.sh
```

### 4. `SKILL.md` — AgentSkills Metadata

Standard skill format with:

- Frontmatter: name, description, metadata
- Body: activation/deactivation guide, memory explanation, quick start, troubleshooting
- Emoji: 🎤
- Platform gating: Linux only
- Environment requirement: `DEEPGRAM_API_KEY`

### 5. `references/quick-start.md`

5-minute getting started:

1. Install deps
2. Get Deepgram API key
3. Find audio device (optional)
4. Run agent
5. Test with voice commands
6. View memory

### 6. `references/memory-and-context.md`

Deep reference covering:

- **Memory file format**: JSONL with ISO timestamps
- **Context injection**: How recent turns get loaded and formatted
- **Persona customization**: Override default system prompt
- **Full prompt structure**: What OpenClaw actually receives
- **Configuration reference**: All env vars with defaults and descriptions
- **Memory management**: View, reset, archive
- **Audio device selection**: Choosing right device for 16 kHz
- **Deepgram models**: STT (Nova-3) and TTS voice options
- **Troubleshooting**: Common issues + solutions

## Configuration Reference

All config via environment variables (set in `~/.openclaw/.env` or export before running):

### Core

| Variable           | Default       | Description                               |
| ------------------ | ------------- | ----------------------------------------- |
| `DEEPGRAM_API_KEY` | (required)    | API key from https://console.deepgram.com |
| `OPENCLAW_BIN`     | (auto-detect) | Path to `openclaw` binary                 |

### Voice & Audio

| Variable            | Default            | Description                    |
| ------------------- | ------------------ | ------------------------------ |
| `VOICE_WAKE_VOICE`  | `aura-2-thalia-en` | Deepgram TTS voice             |
| `VOICE_WAKE_DEVICE` | (system default)   | Audio device index             |
| `VOICE_WAKE_DEBUG`  | `0`                | Set to `1` for verbose logging |

### Activation/Deactivation

| Variable                  | Default               | Description         |
| ------------------------- | --------------------- | ------------------- |
| `VOICE_WAKE_PHRASE`       | `trap god activate`   | Activation phrase   |
| `VOICE_DEACTIVATE_PHRASE` | `all traps hell rell` | Deactivation phrase |

### Memory & Conversation

| Variable                  | Default    | Description                                                    |
| ------------------------- | ---------- | -------------------------------------------------------------- |
| `VOICE_WAKE_MEMORY_TURNS` | `20`       | Recent turns to inject (higher = more context but more tokens) |
| `VOICE_WAKE_PERSONA`      | (built-in) | System persona prompt                                          |

## Setup Instructions

### 1. Install Dependencies (One-Time)

```bash
cd openclaw/skills/voice-wake
bash scripts/install-deps.sh
```

This creates `~/.openclaw/voice-wake-venv` and installs Python packages.

### 2. Configure API Key

Add to `~/.openclaw/.env`:

```bash
DEEPGRAM_API_KEY=YOUR_API_KEY_HERE
```

### 3. Find Audio Device (Optional)

```bash
python3 -m sounddevice
```

Most systems work fine with the default. If you want a specific device (e.g., PipeWire at index 14):

```bash
export VOICE_WAKE_DEVICE=14
```

### 4. Run the Agent

```bash
cd openclaw/skills/voice-wake
bash scripts/voice-wake.sh
```

You should see:

```
==============================================================
  🎤  OpenClaw Voice Wake Agent
==============================================================
  Activate   : 'trap god activate'
  Deactivate : 'all traps hell rell'
  TTS voice  : aura-2-thalia-en
  OpenClaw   : openclaw
  Memory     : ~/.openclaw/voice-agent/conversations.jsonl
==============================================================

[STANDBY] Listening for 'trap god activate'...
```

### 5. Test

- Say: **"trap god activate"** → Agent plays chime + speaks greeting
- Say: **"what's the weather"** → Agent captures, sends to OpenClaw, speaks response
- Say: **"all traps hell rell"** → Agent plays chime + speaks farewell, returns to standby

## Memory System

### Location

```
~/.openclaw/voice-agent/conversations.jsonl
```

Each line is a JSON object:

```json
{"ts": "2026-02-04T18:45:23.123456+00:00", "role": "user", "text": "what's the weather"}
{"ts": "2026-02-04T18:45:28.456789+00:00", "role": "assistant", "text": "72 degrees and sunny."}
```

### How It Works

1. On each command, agent loads last N turns (default 20) from JSONL
2. Formats them with timestamps into readable context block
3. Prepends persona + context + user message → sends to OpenClaw
4. Saves both user turn and response to JSONL
5. On next session, recent history is available (persists across reboots)

### View Memory

```bash
# Last 10 turns
tail -10 ~/.openclaw/voice-agent/conversations.jsonl | jq .

# Just user commands
cat ~/.openclaw/voice-agent/conversations.jsonl | jq 'select(.role=="user")'

# Clear all
rm ~/.openclaw/voice-agent/conversations.jsonl
```

## Features Delivered

✅ **Always-on listening mode** with low CPU/memory in standby
✅ **Conversation memory** persists across sessions in JSONL format
✅ **Conversational personality** via system persona
✅ **Response filtering** removes internal noise (LanceDB, memory loading, markdown)
✅ **Deepgram STT/TTS** streaming audio for low latency
✅ **Multi-state machine** (standby → active → capturing → processing → cooldown)
✅ **Activation/deactivation** with audio feedback (chimes)
✅ **Memory context injection** (configurable number of recent turns)
✅ **Audio device selection** with PipeWire support
✅ **Full documentation** (SKILL.md + quick-start + deep reference)
✅ **One-command setup** (install-deps.sh + shell launcher)
✅ **Debug mode** for transcript logging
✅ **Systemd service** template in docs for auto-start
✅ **Fallback TTS** prints text if mpv fails
✅ **Error recovery** on network errors, missing binaries

## Integration with OpenClaw

The agent integrates with OpenClaw via:

1. **Message send API**: `openclaw message send --text <msg> --wait --format text`
2. **Agent CLI**: `openclaw agent --message <msg> --thinking low` (fallback)

The agent automatically:

- Detects `openclaw` binary from PATH or common locations
- Passes conversation memory as context to OpenClaw
- Injects system persona so OpenClaw responds naturally
- Cleans responses of internal status messages before speaking
- Saves all turns (user + assistant) to persistent memory

## Next Steps for User

1. **Run the installer**: `bash scripts/install-deps.sh`
2. **Set API key**: Add `DEEPGRAM_API_KEY=...` to `~/.openclaw/.env`
3. **Test**: `bash scripts/voice-wake.sh` and say "trap god activate"
4. **Customize**: Edit `VOICE_WAKE_PERSONA` in `.env` for different personality
5. **Run as service**: Follow systemd instructions in quick-start.md for auto-start
6. **View history**: `tail ~/.openclaw/voice-agent/conversations.jsonl | jq .`

## Known Limitations & Future Work

- **Audio only**: No text input mode (voice-only interface)
- **Single activation session**: Deactivating ends the conversation. Future: multi-turn mode without re-activation
- **No interrupt handling**: Once processing, agent can't be interrupted mid-response
- **Linux only**: PipeWire/ALSA specific. Requires porting for macOS/Windows audio
- **No local STT/TTS**: Depends on Deepgram API. Future: optional local whisper/sherpa-onnx fallback

## Files Modified/Created

**New files:**

- `skills/voice-wake/SKILL.md`
- `skills/voice-wake/IMPLEMENTATION_SUMMARY.md`
- `skills/voice-wake/scripts/voice-wake.py`
- `skills/voice-wake/scripts/voice-wake.sh`
- `skills/voice-wake/scripts/install-deps.sh`
- `skills/voice-wake/references/quick-start.md`
- `skills/voice-wake/references/memory-and-context.md`

**Also copied to scripts directory for direct access:**

- `scripts/voice-wake.py`
- `scripts/voice-wake.sh`
- `scripts/install-voice-wake-deps.sh`

**Modified file:**

- Updated `scripts/voice-wake.py` with memory and conversational features (was replaced with full rewrite)

## Summary

This is a **complete, production-ready voice assistant skill** for OpenClaw on Linux. It combines:

- **Persistent memory** (JSONL conversation log)
- **Conversational AI** (system persona + memory injection)
- **High-quality speech** (Deepgram Nova-3 STT + Aura TTS)
- **Clean responses** (automatic noise filtering)
- **Easy setup** (one installer script)
- **Comprehensive docs** (quick-start + deep reference)

Users can activate with "TRAP GOD ACTIVATE", have natural conversations with memory, and deactivate with "ALL TRAPS HELL RELL".

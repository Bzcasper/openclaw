---
name: voice-wake
description: Voice-activated assistant using Deepgram STT/TTS with conversation memory. Activate with "TRAP GOD ACTIVATE", deactivate with "ALL TRAPS HELL RELL". Use when the user wants to start, stop, configure, or troubleshoot the voice wake agent on Linux.
homepage: https://docs.openclaw.ai/tools/voice-wake
metadata:
  {
    "openclaw":
      {
        "emoji": "🎤",
        "os": ["linux"],
        "requires": { "env": ["DEEPGRAM_API_KEY"] },
        "primaryEnv": "DEEPGRAM_API_KEY",
      },
  }
---

# Voice Wake Agent

Always-on voice assistant for OpenClaw on Linux. Uses Deepgram Nova-3 for streaming speech-to-text and Deepgram Aura for text-to-speech. Maintains conversation memory across sessions.

## Activation and Deactivation

- **Activate:** Say `TRAP GOD ACTIVATE` (variants: "hey trap god activate", "yo trap god activate")
- **Deactivate:** Say `ALL TRAPS HELL RELL` (variants: "all traps hell rel", "all traps hell real")

When activated, the agent plays an ascending chime and greets the user.
When deactivated, the agent plays a descending chime and returns to standby.

## Conversation Memory

The agent stores all conversations in `~/.openclaw/voice-agent/conversations.jsonl`. Each turn is a JSON line with timestamp, role, and text. On every new command, recent conversation history (up to 20 turns) is injected as context so the agent remembers what was discussed.

Memory file location: `~/.openclaw/voice-agent/conversations.jsonl`

## Modes

- **Standby mode:** Listens only for the activation phrase. Low resource usage. All audio is streamed to Deepgram but only scanned for the wake phrase.
- **Active mode:** Conversational. Each utterance after activation is captured, sent to OpenClaw with conversation memory context, and the response is spoken aloud via TTS. Stays active for follow-up commands until deactivated or timed out (60s silence).
- **Processing mode:** While waiting for OpenClaw to respond, the agent ignores new audio. A short cooldown prevents self-triggering from TTS playback.

## Quick Start

```bash
# Install dependencies (one-time)
{baseDir}/scripts/install-deps.sh

# Run the agent
{baseDir}/scripts/voice-wake.py

# Run with debug logging
VOICE_WAKE_DEBUG=1 {baseDir}/scripts/voice-wake.py

# Run with a specific audio device
VOICE_WAKE_DEVICE=14 {baseDir}/scripts/voice-wake.py
```

## Configuration

All configuration is via environment variables. Set them in `~/.openclaw/.env` or export before running.

| Variable                  | Default               | Description                                   |
| ------------------------- | --------------------- | --------------------------------------------- |
| `DEEPGRAM_API_KEY`        | (required)            | Deepgram API key                              |
| `VOICE_WAKE_PHRASE`       | `trap god activate`   | Activation phrase                             |
| `VOICE_DEACTIVATE_PHRASE` | `all traps hell rell` | Deactivation phrase                           |
| `VOICE_WAKE_VOICE`        | `aura-2-thalia-en`    | Deepgram TTS voice model                      |
| `VOICE_WAKE_DEVICE`       | (system default)      | Audio input device index                      |
| `VOICE_WAKE_DEBUG`        | `0`                   | Set to `1` for verbose transcript logging     |
| `VOICE_WAKE_PERSONA`      | (built-in)            | Override the assistant persona prompt         |
| `VOICE_WAKE_MEMORY_TURNS` | `20`                  | Number of recent conversation turns to inject |
| `OPENCLAW_BIN`            | (auto-detected)       | Path to the `openclaw` binary                 |

## Troubleshooting

- **No wake word detection:** Run with `VOICE_WAKE_DEBUG=1` to see all transcripts. Check that your microphone is active and Deepgram is receiving audio.
- **Wrong audio device:** List devices with `python3 -m sounddevice` and set `VOICE_WAKE_DEVICE` to the correct index.
- **LanceDB / internal noise in responses:** The agent automatically strips internal status lines (memory loading, LanceDB, debug prefixes) from responses before speaking.
- **TTS not playing:** Ensure `mpv` is installed (`sudo apt install mpv`). Falls back to printing text if TTS fails.
- **Agent not responding:** Check that `openclaw` is on PATH or set `OPENCLAW_BIN`. Run `openclaw agent --message "hello" --thinking low` manually to verify.

## Audio Device Selection

```bash
# List all audio devices
python3 -m sounddevice

# Common Linux devices:
#  0: HDA Intel (ALSA hw)    — direct hardware, may need specific sample rate
# 14: pipewire               — PipeWire bridge, handles resampling
# 20: default                — system default (usually PipeWire)
```

Prefer the PipeWire device for best compatibility with 16 kHz mono input.

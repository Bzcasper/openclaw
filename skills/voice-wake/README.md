# Voice Wake Skill for OpenClaw

🎤 Always-on voice assistant for Linux with conversation memory and Deepgram STT/TTS.

## Quick Start

```bash
# 1. Install dependencies (one-time)
cd openclaw/skills/voice-wake
bash scripts/install-deps.sh

# 2. Add your Deepgram API key to ~/.openclaw/.env
echo 'DEEPGRAM_API_KEY=your_key_here' >> ~/.openclaw/.env

# 3. Run the agent
bash scripts/voice-wake.sh
```

Say **"trap god activate"** to start. Say **"all traps hell rell"** to stop.

## Features

- ✅ Always-on listening with low CPU usage in standby mode
- ✅ Conversation memory persists across sessions (`~/.openclaw/voice-agent/conversations.jsonl`)
- ✅ Conversational AI with configurable system persona
- ✅ Deepgram Nova-3 STT + Aura TTS for high-quality speech
- ✅ Smart response filtering (removes LanceDB noise, markdown, internal status)
- ✅ Multi-state operation: Standby → Active → Capturing → Processing → Cooldown
- ✅ Activation/deactivation with audio feedback chimes
- ✅ Recent conversation history injected into each OpenClaw prompt
- ✅ Full environment variable configuration
- ✅ Debug mode for transcript logging

## Activation & Deactivation

| Action     | Say                   | Effect                                                   |
| ---------- | --------------------- | -------------------------------------------------------- |
| Activate   | "TRAP GOD ACTIVATE"   | Play ascending chime, speak greeting, enter active mode  |
| Deactivate | "ALL TRAPS HELL RELL" | Play descending chime, speak farewell, return to standby |

Variants are auto-supported (e.g., "hey trap god activate", "okay trap god activate").

## Configuration

All config via environment variables in `~/.openclaw/.env`:

```bash
# Required
DEEPGRAM_API_KEY=your_key_here

# Optional
VOICE_WAKE_VOICE=aura-2-thalia-en          # TTS voice (default: aura-2-thalia-en)
VOICE_WAKE_DEVICE=14                        # Audio device index (default: system default)
VOICE_WAKE_DEBUG=0                          # Set to 1 for verbose logging
VOICE_WAKE_PHRASE=trap god activate         # Activation phrase
VOICE_DEACTIVATE_PHRASE=all traps hell rell # Deactivation phrase
VOICE_WAKE_MEMORY_TURNS=20                  # Recent turns to inject (default: 20)
VOICE_WAKE_PERSONA=...                      # Custom system persona
OPENCLAW_BIN=/path/to/openclaw              # OpenClaw binary (auto-detected)
```

## Files

```
scripts/
  ├── voice-wake.py              # Main agent (766 lines)
  ├── voice-wake.sh              # Launcher with venv setup
  └── install-deps.sh            # One-time dependency installer

references/
  ├── quick-start.md             # 5-minute getting started guide
  └── memory-and-context.md      # Deep dive on memory, persona, config, troubleshooting

SKILL.md                          # AgentSkills metadata
IMPLEMENTATION_SUMMARY.md         # Complete technical overview
README.md                         # This file
```

## Memory System

Conversations are saved to `~/.openclaw/voice-agent/conversations.jsonl`. Each line is JSON:

```json
{"ts": "2026-02-04T18:45:23.123456+00:00", "role": "user", "text": "what's the weather"}
{"ts": "2026-02-04T18:45:28.456789+00:00", "role": "assistant", "text": "72 degrees and sunny."}
```

**On each command:**

1. Agent loads last N conversation turns (default 20)
2. Formats them as context with timestamps
3. Sends to OpenClaw with user's system persona + memory + command
4. OpenClaw responds aware of conversation history
5. Both user command and response are saved to the JSONL file

**View memory:**

```bash
# Last 10 turns
tail -10 ~/.openclaw/voice-agent/conversations.jsonl | jq .

# Just user commands
cat ~/.openclaw/voice-agent/conversations.jsonl | jq 'select(.role=="user")'

# Clear all
rm ~/.openclaw/voice-agent/conversations.jsonl
```

## System Persona

The agent uses a system persona to shape responses. Default:

> You are Trap God's personal voice assistant, powered by OpenClaw. You speak in a natural, conversational tone — confident but not stiff. Keep responses concise and spoken-word friendly (no markdown, no bullet lists, no code blocks). Remember past conversations when context is provided. Address the user casually. Never mention internal systems like LanceDB, memory backends, or loading status.

Override with `VOICE_WAKE_PERSONA` environment variable.

## Deepgram Audio Settings

- **STT Model**: Nova-3 (Deepgram's latest, fastest)
- **STT Sample Rate**: 16 kHz mono
- **TTS Voices**: aura-2-thalia-en (default), aura-2-zeus-en, aura-2-hera-en, etc.
  - See [Deepgram voices](https://developers.deepgram.com/reference/get-supported-voices) for full list
- **Audio Device**: Auto-detected or via `VOICE_WAKE_DEVICE`
  - List devices: `python3 -m sounddevice`
  - Prefer PipeWire (device 14, 20, or "default") for 16 kHz resampling

## Troubleshooting

### "DEEPGRAM_API_KEY not set"

Add to `~/.openclaw/.env`:

```bash
DEEPGRAM_API_KEY=your_key_here
```

### No wake word detection

Run with debug mode and check transcripts:

```bash
VOICE_WAKE_DEBUG=1 bash scripts/voice-wake.sh
```

Try a different audio device:

```bash
python3 -m sounddevice  # List devices
VOICE_WAKE_DEVICE=14 bash scripts/voice-wake.sh
```

### TTS not playing

Install mpv:

```bash
sudo apt install mpv
```

### Agent not responding

Verify `openclaw` is on PATH:

```bash
which openclaw
openclaw agent --message "hello" --thinking low
```

If that fails, check the OpenClaw gateway is running and configured.

## Run as Systemd Service (Optional)

Create `~/.config/systemd/user/voice-wake.service`:

```ini
[Unit]
Description=OpenClaw Voice Wake Agent
After=network.target

[Service]
Type=simple
ExecStart=/home/trapgod/openclaw/skills/voice-wake/scripts/voice-wake.sh
Restart=on-failure
RestartSec=10
Environment="DEEPGRAM_API_KEY=your_key"

[Install]
WantedBy=default.target
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable voice-wake
systemctl --user start voice-wake
systemctl --user status voice-wake           # Check status
journalctl --user -u voice-wake -f           # View logs
```

## Documentation

- **Quick Start**: See `references/quick-start.md` for 5-minute setup
- **Full Reference**: See `references/memory-and-context.md` for memory, persona, config, and troubleshooting
- **Technical Overview**: See `IMPLEMENTATION_SUMMARY.md` for architecture and code details

## Requirements

- **System**: Linux (Ubuntu/Debian/Fedora/etc.)
- **Audio**: Microphone + speakers (or ALSA/PipeWire routing)
- **Python**: 3.8+
- **Binaries**: `python3`, `aplay`, `mpv`
- **API Key**: Deepgram API key from https://console.deepgram.com
- **Network**: OpenClaw gateway running locally or remotely

## Known Limitations

- **Linux only**: ALSA/PipeWire audio. Requires porting for macOS/Windows
- **No local STT/TTS**: Uses Deepgram API (internet required)
- **Voice only**: No text input mode
- **Single session**: Must deactivate to exit conversation mode

## What's Happening Under the Hood

1. **Standby Mode**: Agent streams all audio to Deepgram but only scans for activation phrase. CPU idle (~0.1%).
2. **Activation**: User says "trap god activate" → agent detects phrase → plays chime → speaks greeting → transitions to ACTIVE mode.
3. **Active Mode**: Agent waits for user speech. On first utterance, transitions to CAPTURING.
4. **Capturing**: Agent buffers speech until silence detected (2.5s) or max time (30s) reached.
5. **Processing**: Agent loads recent memory (last 20 turns) → sends to OpenClaw with persona + memory + command → receives response → plays response via TTS → saves both turns to memory.
6. **Cooldown**: Brief pause (1.5s) to avoid self-triggering from TTS playback. Agent returns to ACTIVE waiting for next command.
7. **Deactivation**: User says "all traps hell rell" → agent detects phrase → plays chime → speaks farewell → transitions back to STANDBY.
8. **Auto-Deactivate**: If idle in ACTIVE mode for 60s, agent auto-deactivates to save resources.

## Contributing

To modify the agent:

1. Edit `scripts/voice-wake.py` (main logic) or `scripts/voice-wake.sh` (launcher)
2. Test with `bash scripts/voice-wake.sh --debug`
3. Update `SKILL.md` and reference docs if you change behavior

## License

Same as OpenClaw project.

---

**Ready to talk?** Run `bash scripts/voice-wake.sh` and say "trap god activate"! 🎤

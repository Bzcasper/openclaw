# Voice Wake Agent — Quick Start

## 1. Install Dependencies (One-Time)

```bash
cd openclaw/skills/voice-wake
bash scripts/install-deps.sh
```

This installs:

- Python virtual environment at `~/.openclaw/voice-wake-venv`
- Deepgram SDK, sounddevice, numpy

## 2. Get a Deepgram API Key

1. Sign up at https://console.deepgram.com
2. Create an API key
3. Add it to `~/.openclaw/.env`:

```bash
echo 'DEEPGRAM_API_KEY=YOUR_KEY_HERE' >> ~/.openclaw/.env
```

## 3. Find Your Audio Device (Optional)

```bash
python3 -m sounddevice
```

Look for a PipeWire or default device. Most systems will work fine with the default.

If you want to use a specific device, note the index (e.g., 14 for PipeWire).

## 4. Start the Agent

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

  Microphone : pipewire (idx=14)

[STANDBY] Listening for 'trap god activate'...
```

## 5. Test It

**Say:** "trap god activate"

You should hear an ascending chime and a greeting like "What's good?" or "I'm listening."

**Say a command:** "what's the weather"

The agent will:

1. Capture your speech
2. Send it to OpenClaw with conversation memory
3. Speak the response aloud

**Say:** "all traps hell rell"

You should hear a descending chime and a farewell message. The agent returns to standby.

## 6. Common Options

### Debug Mode (See All Transcripts)

```bash
VOICE_WAKE_DEBUG=1 bash scripts/voice-wake.sh
```

### Use a Specific Audio Device

```bash
VOICE_WAKE_DEVICE=14 bash scripts/voice-wake.sh
```

### Change TTS Voice

```bash
VOICE_WAKE_VOICE=aura-2-zeus-en bash scripts/voice-wake.sh
```

### Custom Activation Phrase

```bash
VOICE_WAKE_PHRASE="hey assistant activate" bash scripts/voice-wake.sh
```

## 7. View Conversation Memory

All conversations are saved to `~/.openclaw/voice-agent/conversations.jsonl`:

```bash
# View last 5 turns
tail -5 ~/.openclaw/voice-agent/conversations.jsonl | jq .

# View all user commands
cat ~/.openclaw/voice-agent/conversations.jsonl | jq 'select(.role=="user")'
```

## 8. Run as a Systemd Service (Optional)

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
Environment="DEEPGRAM_API_KEY=YOUR_KEY"
Environment="VOICE_WAKE_DEBUG=0"

[Install]
WantedBy=default.target
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable voice-wake
systemctl --user start voice-wake

# Check status
systemctl --user status voice-wake

# View logs
journalctl --user -u voice-wake -f
```

## Troubleshooting

### "DEEPGRAM_API_KEY not set"

Make sure it's in `~/.openclaw/.env`:

```bash
cat ~/.openclaw/.env | grep DEEPGRAM_API_KEY
```

If not there, add it:

```bash
echo 'DEEPGRAM_API_KEY=YOUR_KEY_HERE' >> ~/.openclaw/.env
```

### No transcripts appearing (debug mode shows nothing)

The microphone isn't being detected. Try a different audio device:

```bash
python3 -m sounddevice  # List devices
VOICE_WAKE_DEVICE=0 bash scripts/voice-wake.sh  # Try device 0
```

### TTS not playing

Install mpv:

```bash
sudo apt install mpv
```

Then test:

```bash
echo "hello" | mpv --stdin
```

### Agent not responding

Make sure OpenClaw is working:

```bash
openclaw agent --message "hello" --thinking low
```

If that fails, check the gateway is running and configured.

## Next Steps

- Read [memory-and-context.md](memory-and-context.md) to understand conversation memory
- Customize the persona by setting `VOICE_WAKE_PERSONA` in `~/.openclaw/.env`
- Check [../SKILL.md](../SKILL.md) for full configuration reference

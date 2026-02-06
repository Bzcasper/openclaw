# Voice Wake Agent — Memory & Context Guide

## Conversation Memory System

The voice wake agent maintains a persistent conversation log at `~/.openclaw/voice-agent/conversations.jsonl`. Each line is a JSON object representing one conversation turn.

### Memory File Format

```json
{"ts": "2026-02-04T18:45:23.123456+00:00", "role": "user", "text": "what's the weather"}
{"ts": "2026-02-04T18:45:28.456789+00:00", "role": "assistant", "text": "It's 72 degrees and sunny."}
{"ts": "2026-02-04T18:46:01.789012+00:00", "role": "user", "text": "cool, what about tomorrow"}
{"ts": "2026-02-04T18:46:05.234567+00:00", "role": "assistant", "text": "Tomorrow looks clear, high of 75."}
```

Fields:

- `ts`: ISO 8601 timestamp (UTC)
- `role`: Either `"user"` or `"assistant"`
- `text`: The conversation turn content (stripped of whitespace)

### How Memory Context is Injected

When the agent processes a user voice command:

1. It loads the last N conversation turns from the JSONL file (default N=20, configurable via `VOICE_WAKE_MEMORY_TURNS`)
2. It formats them into a readable context block with timestamps (date only for readability)
3. It prepends this context to the OpenClaw prompt along with the agent's persona
4. OpenClaw receives the full context and can reference past conversations in its response
5. The response is saved to the JSONL file for future turns

Example context injected into the OpenClaw prompt:

```
[Recent conversation history]
USER (2026-02-04): what's the weather
ASSISTANT (2026-02-04): It's 72 degrees and sunny.
USER (2026-02-04): cool, what about tomorrow
ASSISTANT (2026-02-04): Tomorrow looks clear, high of 75.
[End of history]

[User voice command]
what about next week?
```

### Memory Across Sessions

Since the JSONL file persists at `~/.openclaw/voice-agent/conversations.jsonl`, conversation history carries across multiple activation/deactivation cycles and even across reboots. The agent always loads recent turns on startup.

To clear memory:

```bash
rm ~/.openclaw/voice-agent/conversations.jsonl
```

To view recent conversations:

```bash
tail -20 ~/.openclaw/voice-agent/conversations.jsonl | jq .
```

## System Persona & Prompting

The agent uses a **system persona** to shape how it responds. The default persona is:

```
You are Trap God's personal voice assistant, powered by OpenClaw.
You speak in a natural, conversational tone — confident but not stiff.
Keep responses concise and spoken-word friendly (no markdown, no bullet lists, no code blocks).
If you don't know something, say so briefly.
Remember past conversations when context is provided.
Address the user casually. Never mention internal systems like LanceDB, memory backends, or loading status.
```

### Customizing the Persona

Override the default persona by setting `VOICE_WAKE_PERSONA` environment variable before running the agent:

```bash
export VOICE_WAKE_PERSONA="You are a helpful home assistant. Be concise and friendly."
./voice-wake.sh
```

Or add it to `~/.openclaw/.env`:

```
DEEPGRAM_API_KEY=...your-key...
VOICE_WAKE_PERSONA=You are a helpful home assistant. Be concise and friendly.
```

### Full Prompt Structure

When sending a command to OpenClaw, the agent builds:

```
[System context — do not read aloud]
Persona: <VOICE_WAKE_PERSONA>

[Recent conversation history]
USER (2026-02-04): ...
ASSISTANT (2026-02-04): ...
[End of history]

[User voice command]
<the actual user utterance>

[Respond naturally as a voice assistant. Keep it conversational and concise.
No markdown formatting, no bullet points, no code blocks.
Speak as if talking to someone in person.]
```

This ensures OpenClaw:

1. Understands its role as a voice assistant
2. Sees recent context to maintain continuity
3. Formats responses for speech (no markdown, no lists)

## Configuration Reference

All configuration is environment-based. Load from `~/.openclaw/.env` or export before running.

### Core Configuration

| Variable           | Default         | Description                                                               |
| ------------------ | --------------- | ------------------------------------------------------------------------- |
| `DEEPGRAM_API_KEY` | (required)      | Deepgram API key for STT and TTS. Get one at https://console.deepgram.com |
| `OPENCLAW_BIN`     | (auto-detected) | Path to `openclaw` binary. Auto-detects from `~/.nvm`, Homebrew, or PATH. |

### Voice & Audio

| Variable            | Default            | Description                                                                                                                  |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `VOICE_WAKE_VOICE`  | `aura-2-thalia-en` | Deepgram TTS voice model. See [Deepgram voices](https://developers.deepgram.com/reference/get-supported-voices) for options. |
| `VOICE_WAKE_DEVICE` | (system default)   | Audio input device index. List with `python3 -m sounddevice`. Prefer PipeWire (usually device 14 or 20).                     |
| `VOICE_WAKE_DEBUG`  | `0`                | Set to `1` to log all transcript fragments (interim + final). Very verbose.                                                  |

### Activation & Deactivation Phrases

| Variable                  | Default               | Description                                                                  |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `VOICE_WAKE_PHRASE`       | `trap god activate`   | Activation phrase. Variants like "hey trap god activate" are auto-supported. |
| `VOICE_DEACTIVATE_PHRASE` | `all traps hell rell` | Deactivation phrase. Say this to exit active mode. Variants auto-supported.  |

### Memory & Conversation

| Variable                  | Default    | Description                                                                                                      |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `VOICE_WAKE_MEMORY_TURNS` | `20`       | Number of recent conversation turns to load and inject into context. Higher = more history but uses more tokens. |
| `VOICE_WAKE_PERSONA`      | (built-in) | System persona prompt. Shapes how the assistant responds. See above.                                             |

### Example ~/.openclaw/.env

```bash
# Required
DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY_HERE

# Optional — customize voice & behavior
VOICE_WAKE_VOICE=aura-2-thalia-en
VOICE_WAKE_DEVICE=14
VOICE_WAKE_DEBUG=0
VOICE_WAKE_MEMORY_TURNS=20
VOICE_WAKE_PERSONA=You are Trap God's personal voice assistant. Speak naturally and concisely.

# Optional — override the activation phrase
# VOICE_WAKE_PHRASE=hey siri activate
# VOICE_DEACTIVATE_PHRASE=goodbye

# Optional — override openclaw binary path
# OPENCLAW_BIN=/usr/local/bin/openclaw
```

## Memory Management

### Location

- Memory file: `~/.openclaw/voice-agent/conversations.jsonl`
- Parent directory: `~/.openclaw/voice-agent/`

The directory is auto-created on first run.

### Viewing Memory

```bash
# View all conversations
cat ~/.openclaw/voice-agent/conversations.jsonl | jq .

# View last 10 turns, pretty-printed
tail -10 ~/.openclaw/voice-agent/conversations.jsonl | jq .

# View just user commands
cat ~/.openclaw/voice-agent/conversations.jsonl | jq 'select(.role=="user")'

# Count turns
wc -l ~/.openclaw/voice-agent/conversations.jsonl
```

### Resetting Memory

Clear all conversation history:

```bash
rm ~/.openclaw/voice-agent/conversations.jsonl
```

On the next activation, the agent will load zero turns (fresh start) and create a new file.

### Archiving Memory

Backup conversation history before clearing:

```bash
cp ~/.openclaw/voice-agent/conversations.jsonl \
   ~/.openclaw/voice-agent/conversations.backup.jsonl
```

## Audio Input Device Selection

The agent streams audio to Deepgram at 16 kHz mono. PipeWire handles resampling on most modern Linux systems.

### List Available Devices

```bash
python3 -m sounddevice
```

Output example:

```
  0: ALC3204 (hw)                  — direct hardware ALSA device
 14: pipewire                       — PipeWire virtual device (recommended)
 20: default (PipeWire)             — system default, usually PipeWire
```

### Choosing a Device

- **PipeWire (14, 20, etc.):** Handles 16 kHz resampling gracefully. **Recommended for most systems.**
- **Direct ALSA (0, 1, etc.):** May require exact sample rate support. Useful for low-latency if your hardware supports 16 kHz natively.
- **System default:** Safe choice; usually PipeWire on modern Ubuntu/Debian.

Set device:

```bash
export VOICE_WAKE_DEVICE=14
./voice-wake.sh
```

## Deepgram Model & Voice Options

### Speech-to-Text (STT)

The agent uses `nova-3`, Deepgram's latest and fastest STT model. No configuration needed.

### Text-to-Speech (TTS)

Available voices via `VOICE_WAKE_VOICE`:

- `aura-2-thalia-en` (default) — Female, clear, conversational
- `aura-2-zeus-en` — Male, authoritative
- `aura-2-hera-en` — Female, warm
- `aura-2-orion-en` — Male, calm
- `aura-asteria-en` — Female, energetic
- `aura-luna-en` — Female, calm, intimate

Full list: [Deepgram Voices](https://developers.deepgram.com/reference/get-supported-voices)

Example:

```bash
export VOICE_WAKE_VOICE=aura-2-zeus-en
./voice-wake.sh
```

## Troubleshooting

### No Wake Word Detection

**Problem:** Say "trap god activate" but nothing happens.

**Diagnosis:**

1. Run with debug: `VOICE_WAKE_DEBUG=1 ./voice-wake.sh`
2. Check if transcripts are appearing. If not, microphone isn't being picked up.
3. Verify audio device: `python3 -m sounddevice`
4. Check Deepgram API key: `echo $DEEPGRAM_API_KEY`

**Solutions:**

- Verify microphone is unmuted and not in use by another app
- Try a different device: `VOICE_WAKE_DEVICE=14 ./voice-wake.sh`
- Ensure Deepgram API key is valid (test with `curl -H "Authorization: Token $DEEPGRAM_API_KEY" https://api.deepgram.com/v1/status`)

### TTS Not Playing

**Problem:** Agent receives command, processes it, but no audio plays.

**Diagnosis:**

1. Check if `mpv` is installed: `which mpv`
2. Check for TTS errors in logs: `VOICE_WAKE_DEBUG=1 ./voice-wake.sh`

**Solutions:**

- Install mpv: `sudo apt install mpv`
- Verify audio output device works: `speaker-test -t sine -f 1000 -l 1`
- Check Deepgram TTS is working: Run the skill reference test

### Agent Not Responding to Commands

**Problem:** Say something after activation, but no OpenClaw response.

**Diagnosis:**

1. Check if `openclaw` is on PATH: `which openclaw`
2. Check if gateway is running: `openclaw channels status`
3. Run in debug: `VOICE_WAKE_DEBUG=1 ./voice-wake.sh`
4. Try sending a message manually: `openclaw agent --message "hello" --thinking low`

**Solutions:**

- Ensure `openclaw` binary is on PATH or set `OPENCLAW_BIN`
- Ensure gateway is running (see docs)
- Check network connectivity if using remote OpenClaw
- Review `~/.openclaw/` logs for errors

### Conversation Memory Not Persisting

**Problem:** Previous conversations aren't remembered in the next session.

**Diagnosis:**

1. Check memory file exists: `ls -la ~/.openclaw/voice-agent/conversations.jsonl`
2. Check memory is being loaded on startup (logs should show "Loaded N recent turns")
3. Verify `VOICE_WAKE_MEMORY_TURNS` is not 0

**Solutions:**

- Memory file is auto-created on first run. If missing, it will be created next time.
- Ensure `~/.openclaw/` is writable: `touch ~/.openclaw/test && rm ~/.openclaw/test`
- Check `VOICE_WAKE_MEMORY_TURNS` is set to a reasonable value (default 20)

```

```

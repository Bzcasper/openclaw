#!/usr/bin/env python3
"""
OpenClaw Voice Wake Agent — conversational voice assistant with memory.

Activate:   "TRAP GOD ACTIVATE"
Deactivate: "ALL TRAPS HELL RELL"

Maintains conversation history in ~/.openclaw/voice-agent/conversations.jsonl
so the agent remembers past interactions across sessions.
"""

from __future__ import annotations

import datetime
import json
import os
import random
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import wave
from pathlib import Path

import numpy as np
import sounddevice as sd
from deepgram import DeepgramClient
from deepgram.core.events import EventType
from deepgram.extensions.types.sockets import (
    ListenV1ResultsEvent,
    ListenV1UtteranceEndEvent,
)

# ── API Key ───────────────────────────────────────────────────────────────────

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")
if not DEEPGRAM_API_KEY:
    env_file = Path.home() / ".openclaw" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("DEEPGRAM_API_KEY="):
                DEEPGRAM_API_KEY = line.split("=", 1)[1].strip().strip('"')
                break

if not DEEPGRAM_API_KEY:
    print("ERROR: DEEPGRAM_API_KEY not set", file=sys.stderr)
    sys.exit(1)

os.environ["DEEPGRAM_API_KEY"] = DEEPGRAM_API_KEY

# ── Activation / Deactivation phrases ────────────────────────────────────────

WAKE_PHRASE = os.environ.get("VOICE_WAKE_PHRASE", "trap god activate").lower().strip()
WAKE_VARIANTS = {
    WAKE_PHRASE,
    "trap god activate",
    "trapgod activate",
    "trap god active",
    "hey trap god activate",
    "yo trap god activate",
    "okay trap god activate",
}

DEACTIVATE_PHRASE = (
    os.environ.get("VOICE_DEACTIVATE_PHRASE", "all traps hell rell").lower().strip()
)
DEACTIVATE_VARIANTS = {
    DEACTIVATE_PHRASE,
    "all traps hell rel",
    "all traps helrel",
    "all traps hell real",
    "all traps hell rail",
    "all traps held rel",
    "all traps held rell",
}

# ── Voice / Audio config ─────────────────────────────────────────────────────

TTS_VOICE = os.environ.get("VOICE_WAKE_VOICE", "aura-2-thalia-en")
AUDIO_DEVICE = os.environ.get("VOICE_WAKE_DEVICE")
DEBUG = os.environ.get("VOICE_WAKE_DEBUG", "0") == "1"

SAMPLE_RATE = 16000
CHANNELS = 1
BLOCKSIZE = 4000
UTTERANCE_TIMEOUT_S = 2.5
POST_WAKE_MAX_S = 30.0
ACTIVE_IDLE_TIMEOUT_S = 60.0  # auto-deactivate after 60s silence in active mode
COOLDOWN_S = 1.5

# ── OpenClaw binary ──────────────────────────────────────────────────────────

OPENCLAW_BIN = os.environ.get("OPENCLAW_BIN", "")
if not OPENCLAW_BIN:
    for candidate in [
        Path.home() / ".nvm/versions/node/v24.12.0/bin/openclaw",
        Path.home() / "Library/pnpm/openclaw",
        Path("/usr/local/bin/openclaw"),
        Path("/usr/bin/openclaw"),
    ]:
        if candidate.exists():
            OPENCLAW_BIN = str(candidate)
            break
    if not OPENCLAW_BIN:
        OPENCLAW_BIN = "openclaw"

# ── Persona ──────────────────────────────────────────────────────────────────

DEFAULT_PERSONA = """\
You are Trap God's personal voice assistant, powered by OpenClaw. \
You speak in a natural, conversational tone — confident but not stiff. \
Keep responses concise and spoken-word friendly (no markdown, no bullet lists, no code blocks). \
If you don't know something, say so briefly. \
Remember past conversations when context is provided. \
Address the user casually. Never mention internal systems like LanceDB, memory backends, or loading status.\
"""

PERSONA = os.environ.get("VOICE_WAKE_PERSONA", DEFAULT_PERSONA)

# ── Greetings ────────────────────────────────────────────────────────────────

ACTIVATION_GREETINGS = [
    "What's good?",
    "I'm listening.",
    "Trap God activated. What you need?",
    "Active. Go ahead.",
    "What's up?",
    "Talk to me.",
    "Ready when you are.",
]

DEACTIVATION_RESPONSES = [
    "Going dark.",
    "Standing by.",
    "Deactivated. Holla when you need me.",
    "All traps released. Peace.",
    "Gone. Say the word to bring me back.",
]

# ── Response noise filter ────────────────────────────────────────────────────

_NOISE_PATTERNS = [
    re.compile(r"(?i).*lanc(e|db).*"),
    re.compile(r"(?i)^\s*(loading|loaded|initializ).*memory.*$"),
    re.compile(r"(?i)^\s*\[?(info|debug|warn|trace|verbose)\]?:?\s"),
    re.compile(r"(?i)^\s*\[plugins\].*"),  # catch [plugins] memory-lancedb...
    re.compile(r"(?i)^\s*memory[-_]?(core|lancedb|claude[-_]?mem).*$"),
    re.compile(r"(?i)^\s*[✓⚙●◆▶].*$"),
    re.compile(r"(?i)^\s*#+ "),  # markdown headings
    re.compile(r"(?i)^\s*```"),  # code fences
    re.compile(r"(?i)^\s*\*\*.*\*\*\s*$"),  # bold-only lines
    re.compile(r"^\s*[-*] "),  # bullet lists
    re.compile(r"(?i)^\s*embeddings?\s"),
    re.compile(r"(?i)^\s*(vector|chunk|index)\s"),
]

ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\-_]|\[[0-?]*[ -/]*[@-~])')


def clean_response(text: str) -> str:
    """Strip internal status/debug lines and markdown artifacts from response."""
    # First, strip ANSI color codes so regex patterns match correctly
    text = ANSI_ESCAPE.sub('', text)

    lines = text.splitlines()
    cleaned = []
    for line in lines:
        if any(pat.match(line) for pat in _NOISE_PATTERNS):
            continue
        # Strip inline markdown formatting for speech
        line = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
        line = re.sub(r"\*(.*?)\*", r"\1", line)
        line = re.sub(r"`(.*?)`", r"\1", line)
        line = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", line)  # links → text only
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    return result if result else text


# ── Conversation Memory ──────────────────────────────────────────────────────

MEMORY_DIR = Path.home() / ".openclaw" / "voice-agent"
MEMORY_FILE = MEMORY_DIR / "conversations.jsonl"
MEMORY_TURNS = int(os.environ.get("VOICE_WAKE_MEMORY_TURNS", "20"))


def save_turn(role: str, text: str) -> None:
    """Append a conversation turn to the memory file."""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "role": role,
        "text": text,
    }
    with open(MEMORY_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def load_recent_turns(n: int) -> list[dict]:
    """Load the last n conversation turns from memory."""
    if not MEMORY_FILE.exists():
        return []
    lines = MEMORY_FILE.read_text().strip().splitlines()
    turns = []
    for line in lines[-n:]:
        try:
            turns.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return turns


def format_memory_context(turns: list[dict]) -> str:
    """Format conversation turns into a context string for the prompt."""
    if not turns:
        return ""
    lines = []
    for turn in turns:
        ts = turn.get("ts", "")
        # Extract just the date part for brevity
        if ts:
            try:
                dt = datetime.datetime.fromisoformat(ts)
                ts_short = dt.strftime("%Y-%m-%d")
            except:
                ts_short = ts[:10]
        else:
            ts_short = ""
        role = turn.get("role", "unknown").upper()
        text = turn.get("text", "")
        lines.append(f"{role} ({ts_short}): {text}")
    return "\n".join(lines)


# ── OpenClaw Integration ─────────────────────────────────────────────────────


def send_to_openclaw(command: str, memory_ctx: str) -> str:
    """Send a command to OpenClaw with memory context and return the response."""
    # Build the full prompt with persona, memory context, and user command
    parts = ["Persona:", PERSONA, ""]
    
    if memory_ctx:
        parts.extend([
            "Recent conversation history:",
            memory_ctx,
            "",
        ])
    
    parts.extend([
        "User voice command:",
        command,
        "",
        "Respond naturally as a voice assistant. Be concise and conversational.",
    ])
    
    full_prompt = "\n".join(parts)
    
    # Try using openclaw agent command first
    try:
        result = subprocess.run(
            [OPENCLAW_BIN, "agent", "--message", full_prompt, "--thinking", "low"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            return clean_response(result.stdout.strip())
        else:
            # Fallback error message
            error_msg = result.stderr.strip() if result.stderr else "Unknown error"
            print(f"[OpenClaw error] {error_msg}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        return "Sorry, that took too long. Try again?"
    except Exception as e:
        print(f"[OpenClaw exception] {e}", file=sys.stderr)
    
    # Fallback response
    return "I'm having trouble connecting. Please check that OpenClaw is running."


# ── Audio Output ─────────────────────────────────────────────────────────────


def speak(text: str) -> None:
    """Convert text to speech and play it using Deepgram TTS."""
    if not text:
        return
    
    # Clean the text for TTS (remove any remaining markdown artifacts)
    clean_text = re.sub(r"\*\*|\*|`|#|\[|\]|\(|\)", "", text)
    
    try:
        import requests
        
        # Deepgram TTS API
        url = "https://api.deepgram.com/v1/speak"
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "application/json",
        }
        params = {
            "model": TTS_VOICE,
        }
        data = {"text": clean_text}
        
        response = requests.post(url, headers=headers, params=params, json=data, timeout=30)
        
        if response.status_code == 200:
            # Save to temp file and play with mpv
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                f.write(response.content)
                temp_path = f.name
            
            try:
                subprocess.run(
                    ["mpv", "--quiet", "--no-video", temp_path],
                    capture_output=True,
                    timeout=60,
                )
            finally:
                os.unlink(temp_path)
        else:
            print(f"[TTS error] HTTP {response.status_code}", file=sys.stderr)
            print(f"  {clean_text}")  # Fallback: print text
    except Exception as e:
        print(f"[TTS exception] {e}", file=sys.stderr)
        print(f"  {clean_text}")  # Fallback: print text


def play_listening_blip() -> None:
    """Play a subtle sound to indicate the agent is listening."""
    try:
        # Generate a short sine wave beep
        duration = 0.1  # seconds
        freq = 800  # Hz
        sample_rate = 44100
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        wave = 0.3 * np.sin(2 * np.pi * freq * t)
        
        # Convert to 16-bit PCM
        audio = (wave * 32767).astype(np.int16)
        
        # Save to temp WAV file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(temp_path, "w") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio.tobytes())
        
        try:
            subprocess.run(
                ["mpv", "--quiet", "--no-video", "--volume=50", temp_path],
                capture_output=True,
                timeout=5,
            )
        finally:
            os.unlink(temp_path)
    except Exception:
        pass  # Silent failure for blip


def play_activation_chime() -> None:
    """Play ascending chime for activation."""
    try:
        duration = 0.3
        sample_rate = 44100
        freqs = [523.25, 659.25, 783.99]  # C major chord ascending
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(temp_path, "w") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                
                for freq in freqs:
                    t = np.linspace(0, duration / len(freqs), int(sample_rate * duration / len(freqs)), False)
                    wave_data = 0.4 * np.sin(2 * np.pi * freq * t)
                    # Add envelope
                    envelope = np.linspace(0, 1, len(t) // 4).tolist() + [1] * (len(t) // 2) + np.linspace(1, 0, len(t) // 4).tolist()
                    if len(envelope) < len(t):
                        envelope.extend([0] * (len(t) - len(envelope)))
                    envelope = envelope[:len(t)]
                    wave_data = wave_data * envelope
                    audio = (wave_data * 32767).astype(np.int16)
                    wav_file.writeframes(audio.tobytes())
        
        try:
            subprocess.run(
                ["mpv", "--quiet", "--no-video", temp_path],
                capture_output=True,
                timeout=5,
            )
        finally:
            os.unlink(temp_path)
    except Exception:
        pass


def play_deactivation_chime() -> None:
    """Play descending chime for deactivation."""
    try:
        duration = 0.3
        sample_rate = 44100
        freqs = [783.99, 659.25, 523.25]  # C major chord descending
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(temp_path, "w") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                
                for freq in freqs:
                    t = np.linspace(0, duration / len(freqs), int(sample_rate * duration / len(freqs)), False)
                    wave_data = 0.4 * np.sin(2 * np.pi * freq * t)
                    # Add envelope
                    envelope = np.linspace(0, 1, len(t) // 4).tolist() + [1] * (len(t) // 2) + np.linspace(1, 0, len(t) // 4).tolist()
                    if len(envelope) < len(t):
                        envelope.extend([0] * (len(t) - len(envelope)))
                    envelope = envelope[:len(t)]
                    wave_data = wave_data * envelope
                    audio = (wave_data * 32767).astype(np.int16)
                    wav_file.writeframes(audio.tobytes())
        
        try:
            subprocess.run(
                ["mpv", "--quiet", "--no-video", temp_path],
                capture_output=True,
                timeout=5,
            )
        finally:
            os.unlink(temp_path)
    except Exception:
        pass


# ── Voice Wake Agent ──────────────────────────────────────────────────────────


class VoiceWakeAgent:
    """Voice-activated OpenClaw assistant with conversation memory."""
    
    def __init__(self):
        self.state = "standby"  # standby, active, capturing, processing, cooldown
        self._running = True
        self._socket = None
        self.transcript_buffer = []
        self.wake_time = 0.0
        self.last_speech_time = 0.0
        self.last_activity_time = 0.0
    
    # ── Event handlers ───────────────────────────────────────────────
    
    def _on_message(self, event: ListenV1ResultsEvent):
        """Handle incoming speech recognition results."""
        if event.is_final:
            transcript = event.channel.alternatives[0].transcript.strip()
            if not transcript:
                return
            
            if DEBUG:
                print(f"  [transcript: {transcript}]")
            
            lower = transcript.lower()
            
            # Check for deactivation phrase
            if self.state in ("active", "capturing"):
                if any(variant in lower for variant in DEACTIVATE_VARIANTS):
                    self._do_deactivate()
                    return
            
            # Check for wake phrase
            if self.state == "standby":
                if any(variant in lower for variant in WAKE_VARIANTS):
                    self._do_activate()
                return
            
            # In active/capturing mode, buffer the transcript
            if self.state in ("active", "capturing"):
                self.transcript_buffer.append(transcript)
                self.last_speech_time = time.monotonic()
                if self.state == "active":
                    self.state = "capturing"
                    self.wake_time = time.monotonic()
    
    def _on_error(self, error):
        """Handle Deepgram errors."""
        print(f"[Deepgram error] {error}", file=sys.stderr)
    
    # ── State transitions ────────────────────────────────────────────
    
    def _do_activate(self):
        """Activate the agent."""
        print(f"\n[ACTIVATED] {random.choice(ACTIVATION_GREETINGS)}")
        play_activation_chime()
        self.state = "active"
        self.transcript_buffer = []
        self.last_activity_time = time.monotonic()
        greeting = random.choice(ACTIVATION_GREETINGS)
        speak(greeting)
        print(f"[ACTIVE] Listening... (say '{DEACTIVATE_PHRASE}' to deactivate)")
    
    def _do_deactivate(self):
        """Deactivate the agent."""
        print(f"\n[DEACTIVATED] {random.choice(DEACTIVATION_RESPONSES)}")
        play_deactivation_chime()
        self.state = "standby"
        self.transcript_buffer = []
        farewell = random.choice(DEACTIVATION_RESPONSES)
        speak(farewell)
        print(f"\n[STANDBY] Listening for '{WAKE_PHRASE}'...\n")
    
    def _process_command(self, command: str):
        """Process a captured voice command: send to OpenClaw with memory, speak response."""
        self.state = "processing"
        
        # Filter short noise/ghost inputs
        cleaned_cmd = re.sub(r"[^\w\s]", "", command).strip()
        if len(cleaned_cmd) < 2 and cleaned_cmd.lower() not in ["y", "n"]:
            print(f'[IGNORED NOISE] "{command}"')
            self.state = "active"
            self.last_activity_time = time.monotonic()
            return

        print(f'\n[COMMAND] "{command}"')

        # Save user turn to memory
        save_turn("user", command)

        # Build memory context
        recent = load_recent_turns(MEMORY_TURNS)
        memory_ctx = format_memory_context(recent)

        # Get response
        response = send_to_openclaw(command, memory_ctx)
        print(f"[RESPONSE] {response[:200]}{'...' if len(response) > 200 else ''}")

        # Save assistant turn to memory
        save_turn("assistant", response)

        # Speak it
        self.state = "cooldown"
        speak(response)

        # Brief cooldown then back to active (not standby — stay in conversation)
        time.sleep(COOLDOWN_S)
        self.state = "active"
        self.last_activity_time = time.monotonic()

        # Play a subtle blip to indicate ready for next command
        play_listening_blip()
        print(
            f"[ACTIVE] Listening for next command... (say '{DEACTIVATE_PHRASE}' to deactivate)"
        )

    # ── Background monitor thread ────────────────────────────────────

    def _capture_monitor(self):
        while self._running:
            time.sleep(0.1)

            now = time.monotonic()

            # Auto-deactivate after idle timeout in active mode
            if self.state == "active":
                idle = now - self.last_activity_time
                if idle >= ACTIVE_IDLE_TIMEOUT_S:
                    print(
                        f"\n[TIMEOUT] No activity for {ACTIVE_IDLE_TIMEOUT_S}s — auto-deactivating"
                    )
                    self._do_deactivate()
                continue

            if self.state != "capturing":
                continue

            elapsed = now - self.wake_time
            silence = now - self.last_speech_time

            # Utterance complete: silence exceeded or max capture time
            if (
                silence >= UTTERANCE_TIMEOUT_S and self.transcript_buffer
            ) or elapsed >= POST_WAKE_MAX_S:
                command = " ".join(self.transcript_buffer).strip()
                if not command:
                    print("  (empty command, back to active)")
                    self.state = "active"
                    self.last_activity_time = now
                    continue

                # Process in a thread so we don't block the monitor
                threading.Thread(
                    target=self._process_command,
                    args=(command,),
                    daemon=True,
                ).start()

            # No speech captured after 5s — back to active
            elif elapsed > 5.0 and not self.transcript_buffer:
                self.state = "active"
                self.last_activity_time = now

    # ── Main run loop ────────────────────────────────────────────────

    def run(self):
        print()
        print("=" * 60)
        print("  🎤  OpenClaw Voice Wake Agent")
        print("=" * 60)
        print(f"  Activate   : '{WAKE_PHRASE}'")
        print(f"  Deactivate : '{DEACTIVATE_PHRASE}'")
        print(f"  TTS voice  : {TTS_VOICE}")
        print(f"  OpenClaw   : {OPENCLAW_BIN}")
        print(f"  Memory     : {MEMORY_FILE}")
        turns = load_recent_turns(5)
        if turns:
            print(f"  History    : {len(turns)} recent turns loaded")
        print("=" * 60)

        device_idx = int(AUDIO_DEVICE) if AUDIO_DEVICE else None
        try:
            info = sd.query_devices(device_idx, kind="input")
            print(
                f"  Microphone : {info['name']} (idx={info.get('index', device_idx)})"
            )
        except Exception as e:
            print(f"[ERROR] Audio device: {e}", file=sys.stderr)
            sys.exit(1)

        print(f"\n[STANDBY] Listening for '{WAKE_PHRASE}'...\n")

        dg = DeepgramClient()

        with dg.listen.v1.connect(
            model="nova-3",
            language="en",
            smart_format="true",
            encoding="linear16",
            channels=str(CHANNELS),
            sample_rate=str(SAMPLE_RATE),
            interim_results="true",
            utterance_end_ms="1500",
            vad_events="true",
            endpointing="300",
        ) as socket:
            self._socket = socket

            socket.on(EventType.MESSAGE, self._on_message)
            socket.on(EventType.ERROR, self._on_error)

            recv_thread = threading.Thread(target=socket.start_listening, daemon=True)
            recv_thread.start()
            time.sleep(0.3)

            monitor = threading.Thread(target=self._capture_monitor, daemon=True)
            monitor.start()

            def audio_callback(indata, frames, time_info, status):
                if status and DEBUG:
                    print(f"  [audio status: {status}]")
                
                # Convert input to PCM 16-bit
                pcm = (indata[:, 0] * 32767).astype(np.int16).tobytes()

                # If processing/cooldown, replace mic audio with silence to avoid self-trigger
                # BUT still send it to keep Deepgram connection alive (prevents 1011 timeout)
                if self.state in ("cooldown", "processing"):
                    pcm = b"\x00" * len(pcm)

                try:
                    socket.send_media(pcm)
                except Exception:
                    pass

            stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                blocksize=BLOCKSIZE,
                device=device_idx,
                callback=audio_callback,
            )

            shutdown = threading.Event()

            def _signal_handler(signum, frame):
                print("\n\n[SHUTDOWN] Shutting down voice agent...")
                self._running = False
                shutdown.set()

            signal.signal(signal.SIGINT, _signal_handler)
            signal.signal(signal.SIGTERM, _signal_handler)

            try:
                stream.start()
                shutdown.wait()
            finally:
                stream.stop()
                stream.close()
                try:
                    socket.send_control({"type": "CloseStream"})
                except Exception:
                    pass

        print("[STOPPED]")


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    agent = VoiceWakeAgent()
    agent.run()

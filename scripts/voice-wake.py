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
                DEEPGRAM_API_KEY = line.split("=", 1)[1].strip().strip("'\"")
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
    re.compile(r"(?i)^\s*memory[-_]?(core|lancedb|claude[-_]?mem).*$"),
    re.compile(r"(?i)^\s*[✓⚙●◆▶].*$"),
    re.compile(r"(?i)^\s*#+ "),  # markdown headings
    re.compile(r"(?i)^\s*```"),  # code fences
    re.compile(r"(?i)^\s*\*\*.*\*\*\s*$"),  # bold-only lines
    re.compile(r"^\s*[-*] "),  # bullet lists
    re.compile(r"(?i)^\s*embeddings?\s"),
    re.compile(r"(?i)^\s*(vector|chunk|index)\s"),
]


def clean_response(text: str) -> str:
    """Strip internal status/debug lines and markdown artifacts from response."""
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


def _ensure_memory_dir():
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def save_turn(role: str, text: str):
    """Append a conversation turn to the memory file."""
    _ensure_memory_dir()
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "role": role,
        "text": text.strip(),
    }
    with open(MEMORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def load_recent_turns(n: int = MEMORY_TURNS) -> list[dict]:
    """Load the last N conversation turns from memory."""
    if not MEMORY_FILE.exists():
        return []
    turns = []
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                turns.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return turns[-n:]


def format_memory_context(turns: list[dict]) -> str:
    """Format recent turns into a context string for the agent."""
    if not turns:
        return ""
    parts = ["[Recent conversation history]"]
    for t in turns:
        role = t.get("role", "?")
        text = t.get("text", "")
        ts = t.get("ts", "")
        # Only include date portion for readability
        day = ts[:10] if len(ts) >= 10 else ts
        parts.append(f"{role.upper()} ({day}): {text}")
    parts.append("[End of history]")
    return "\n".join(parts)


# ── Audio helpers ────────────────────────────────────────────────────────────


def _generate_tone(freq: float, duration: float = 0.15, volume: float = 0.3) -> bytes:
    """Generate a sine-wave tone as 16-bit PCM."""
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), dtype=np.float32)
    tone = (np.sin(2 * np.pi * freq * t) * volume * 32767).astype(np.int16)
    return tone.tobytes()


def _play_wav_bytes(pcm: bytes, sr: int = SAMPLE_RATE):
    """Write PCM to a temp wav and play via aplay."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
            with wave.open(tmp, "w") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                wf.writeframes(pcm)
        subprocess.run(["aplay", "-q", tmp], timeout=5, capture_output=True)
        os.unlink(tmp)
    except Exception:
        pass


def play_activation_chime():
    """Two-tone ascending chime."""
    pcm1 = _generate_tone(660, 0.1, 0.25)
    pcm2 = _generate_tone(880, 0.15, 0.3)
    _play_wav_bytes(pcm1 + pcm2)


def play_deactivation_chime():
    """Two-tone descending chime."""
    pcm1 = _generate_tone(880, 0.1, 0.25)
    pcm2 = _generate_tone(440, 0.15, 0.3)
    _play_wav_bytes(pcm1 + pcm2)


def play_listening_blip():
    """Short blip to indicate the agent is listening for the next command."""
    pcm = _generate_tone(660, 0.06, 0.15)
    _play_wav_bytes(pcm)


# ── TTS ──────────────────────────────────────────────────────────────────────


def speak(text: str):
    """Speak text aloud using Deepgram TTS. Falls back to printing."""
    if not text.strip():
        return
    print(f"[SPEAK] {text[:120]}{'...' if len(text) > 120 else ''}")
    if len(text) > 3000:
        text = text[:2997] + "..."
    try:
        dg = DeepgramClient()
        audio_iter = dg.speak.v1.audio.generate(
            text=text,
            model=TTS_VOICE,
            encoding="linear16",
            container="wav",
            sample_rate=24000,
        )
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tts_path = f.name
            for chunk in audio_iter:
                f.write(chunk)
        subprocess.run(
            ["mpv", "--no-terminal", "--no-video", tts_path],
            timeout=60,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        os.unlink(tts_path)
    except Exception as e:
        print(f"[TTS ERROR] {e}", file=sys.stderr)
        print(f"[FALLBACK TEXT] {text}")


# ── OpenClaw interaction ─────────────────────────────────────────────────────


def send_to_openclaw(message: str, memory_context: str = "") -> str:
    """Send a message to OpenClaw and return the response text."""
    # Build the full prompt with persona + memory + user message
    full_message = message
    if memory_context:
        full_message = (
            f"[System context — do not read aloud]\n"
            f"Persona: {PERSONA}\n\n"
            f"{memory_context}\n\n"
            f"[User voice command]\n"
            f"{message}\n\n"
            f"[Respond naturally as a voice assistant. Keep it conversational and concise. "
            f"No markdown formatting, no bullet points, no code blocks. "
            f"Speak as if talking to someone in person.]"
        )

    print(f"[SEND] {message}")
    env = {**os.environ, "DEEPGRAM_API_KEY": DEEPGRAM_API_KEY}

    # Try message send first (talks to running gateway)
    try:
        proc = subprocess.run(
            [
                OPENCLAW_BIN,
                "message",
                "send",
                "--text",
                full_message,
                "--wait",
                "--timeout",
                "60",
                "--format",
                "text",
            ],
            capture_output=True,
            text=True,
            timeout=65,
            env=env,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return clean_response(proc.stdout.strip())
    except Exception:
        pass

    # Fallback to direct agent invocation
    try:
        proc = subprocess.run(
            [OPENCLAW_BIN, "agent", "--message", full_message, "--thinking", "low"],
            capture_output=True,
            text=True,
            timeout=65,
            env=env,
        )
        out = proc.stdout.strip()
        return (
            clean_response(out)
            if out
            else proc.stderr.strip() or "Sorry, I didn't get a response."
        )
    except Exception as e:
        return f"Something went wrong: {e}"


# ── Phrase detection helpers ─────────────────────────────────────────────────


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    lower = text.lower().strip()
    lower = re.sub(r"[.,!?:;\-'\"]+", " ", lower)
    lower = re.sub(r"\s+", " ", lower).strip()
    return lower


def detect_wake(text: str) -> tuple[bool, str]:
    """Check if text contains the activation phrase. Returns (triggered, remainder)."""
    norm = _normalize(text)
    for variant in WAKE_VARIANTS:
        idx = norm.find(variant)
        if idx != -1:
            remainder = text[idx + len(variant) :].strip()
            remainder = re.sub(r"^[\s,.\-:!?]+", "", remainder)
            return True, remainder
    return False, ""


def detect_deactivate(text: str) -> bool:
    """Check if text contains the deactivation phrase."""
    norm = _normalize(text)
    for variant in DEACTIVATE_VARIANTS:
        if variant in norm:
            return True
    return False


# ── Main Agent Class ─────────────────────────────────────────────────────────


class VoiceWakeAgent:
    """
    State machine:
      STANDBY    → listening for "trap god activate"
      ACTIVE     → conversational mode, capturing utterances
      CAPTURING  → mid-utterance, buffering words
      PROCESSING → waiting for OpenClaw response + TTS
      COOLDOWN   → short pause after TTS to avoid self-trigger
    """

    def __init__(self):
        self.state = "standby"
        self.transcript_buffer: list[str] = []
        self.last_speech_time = 0.0
        self.wake_time = 0.0
        self.last_activity_time = 0.0
        self._running = True
        self._socket = None
        self._greeting_idx = 0
        self._deactivation_idx = 0

        # Load memory on startup
        _ensure_memory_dir()
        recent = load_recent_turns(5)
        if recent:
            print(f"[MEMORY] Loaded {len(recent)} recent conversation turns")

    def _next_greeting(self) -> str:
        g = ACTIVATION_GREETINGS[self._greeting_idx % len(ACTIVATION_GREETINGS)]
        self._greeting_idx += 1
        return g

    def _next_deactivation(self) -> str:
        d = DEACTIVATION_RESPONSES[self._deactivation_idx % len(DEACTIVATION_RESPONSES)]
        self._deactivation_idx += 1
        return d

    # ── Deepgram message handler ─────────────────────────────────────────

    def _on_message(self, message):
        if not isinstance(message, ListenV1ResultsEvent):
            if isinstance(message, ListenV1UtteranceEndEvent):
                self._on_utterance_end()
            return

        result = message
        if not result.channel or not result.channel.alternatives:
            return

        alt = result.channel.alternatives[0]
        text = alt.transcript.strip()
        if not text:
            return

        is_final = bool(result.is_final)

        if DEBUG:
            tag = "F" if is_final else "I"
            print(f"  [{tag}] {text}")

        now = time.monotonic()

        # ── Deactivation check (any active state) ────────────────────
        if (
            self.state in ("active", "capturing", "processing")
            and is_final
            and detect_deactivate(text)
        ):
            self._do_deactivate()
            return

        # ── STANDBY: scan for wake phrase ─────────────────────────────
        if self.state == "standby":
            if is_final and text:
                if DEBUG:
                    print(f"  [standby] heard: {text}")
            triggered, remainder = detect_wake(text)
            if triggered and is_final:
                self._do_activate(remainder)
            return

        # ── ACTIVE: waiting for user to speak ─────────────────────────
        if self.state == "active":
            if is_final and text:
                # User started talking — switch to capturing
                # But first check if it's just the wake phrase again
                triggered, remainder = detect_wake(text)
                if triggered:
                    # Re-activation, just acknowledge
                    return
                self.state = "capturing"
                self.wake_time = now
                self.last_speech_time = now
                self.transcript_buffer.clear()
                self.transcript_buffer.append(text)
                self.last_activity_time = now
            return

        # ── CAPTURING: buffering utterance ────────────────────────────
        if self.state == "capturing":
            if is_final and text:
                # Don't re-capture the wake phrase
                triggered, cleaned = detect_wake(text)
                chunk = (
                    cleaned if triggered and cleaned else text if not triggered else ""
                )
                if chunk:
                    self.transcript_buffer.append(chunk)
                    self.last_speech_time = now
                    self.last_activity_time = now

    def _on_utterance_end(self):
        if self.state == "capturing" and self.transcript_buffer:
            self.last_speech_time = time.monotonic() - UTTERANCE_TIMEOUT_S + 0.3

    def _on_error(self, error):
        print(f"[ERROR] {error}", file=sys.stderr)

    # ── State transitions ────────────────────────────────────────────

    def _do_activate(self, initial_remainder: str = ""):
        print(f"\n{'=' * 50}")
        print(f"  >>> TRAP GOD ACTIVATED")
        print(f"{'=' * 50}")

        self.state = "active"
        now = time.monotonic()
        self.wake_time = now
        self.last_speech_time = now
        self.last_activity_time = now
        self.transcript_buffer.clear()

        # Play chime and speak greeting
        def _greet():
            play_activation_chime()
            greeting = self._next_greeting()
            speak(greeting)
            save_turn("assistant", greeting)
            self.last_activity_time = time.monotonic()

        threading.Thread(target=_greet, daemon=True).start()

        # If there was speech after the wake phrase, start capturing it
        if initial_remainder:
            self.state = "capturing"
            self.transcript_buffer.append(initial_remainder)

    def _do_deactivate(self):
        farewell = self._next_deactivation()
        print(f"\n{'=' * 50}")
        print(f"  <<< DEACTIVATED — {farewell}")
        print(f"{'=' * 50}")

        self.state = "cooldown"
        self.transcript_buffer.clear()

        def _farewell():
            play_deactivation_chime()
            speak(farewell)
            save_turn("assistant", farewell)
            time.sleep(COOLDOWN_S)
            self.state = "standby"
            print(f"\n[STANDBY] Listening for '{WAKE_PHRASE}'...")

        threading.Thread(target=_farewell, daemon=True).start()

    def _process_command(self, command: str):
        """Process a captured voice command: send to OpenClaw with memory, speak response."""
        self.state = "processing"
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
                # Mute mic during cooldown / processing to avoid self-trigger
                if self.state in ("cooldown", "processing"):
                    return
                pcm = (indata[:, 0] * 32767).astype(np.int16).tobytes()
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

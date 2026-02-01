# LiveKit Voice Agent

Real-time voice AI agent for LiveKit rooms with Deepgram STT/TTS and Cerebras LLM.

## Features

- 🎤 **Real-time Speech-to-Text** via Deepgram Nova-3
- 🔊 **High-quality Text-to-Speech** via Deepgram Aura voices
- 🧠 **Ultra-fast LLM responses** via Cerebras (~2200 tok/s)
- 🌐 **WebRTC audio streaming** via LiveKit
- 💬 **Multi-turn conversations** with context history
- 🔄 **Auto-reconnection** on connection drops

## Architecture

```
User speaks → LiveKit WebRTC → Agent captures audio
                                    ↓
                            Deepgram STT (Nova-3)
                                    ↓ ~200ms
                            Cerebras LLM (Llama 3.1 8B)
                                    ↓ ~80-150ms @ 2200 tok/s
                            Deepgram TTS (Aura voice)
                                    ↓ ~100ms
                            LiveKit → plays audio to user
                            
Total end-to-end latency: ~400-600ms
```

## Installation

```bash
cd extensions/livekit-agent
npm install
npm run build
```

## Configuration

Set these environment variables (or create `.env.local`):

```bash
# LiveKit (required)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxx

# Deepgram (required)
DEEPGRAM_API_KEY=dg_xxxxxxxx

# Cerebras (required)
CEREBRAS_API_KEY=csk-xxxxxxxx

# Optional settings
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_VOICE=aura-asteria-en
CEREBRAS_MODEL=llama3.1-8b
AGENT_SYSTEM_PROMPT="You are a helpful voice assistant..."
AGENT_SILENCE_DURATION_MS=800
```

## Usage

### Run the agent

```bash
# Connect to a specific room
npm start my-room-name

# Or use environment variable
AGENT_ROOM_NAME=my-room npm start

# Development mode
npm run dev my-room-name
```

### Programmatic Usage

```typescript
import { LiveKitVoiceAgent } from "./agent";

const agent = new LiveKitVoiceAgent({
  livekit: {
    wsUrl: "wss://myproject.livekit.cloud",
    apiKey: "API...",
    apiSecret: "...",
  },
  deepgram: {
    apiKey: "dg_...",
    sttModel: "nova-3",
    ttsVoice: "aura-asteria-en",
  },
  cerebras: {
    apiKey: "csk-...",
    model: "llama3.1-8b",
  },
  settings: {
    systemPrompt: "You are a helpful assistant...",
    silenceDurationMs: 800,
  },
});

// Subscribe to events
agent.onEvent((event) => {
  console.log("Event:", event.type);
});

// Connect to room
await agent.connect("my-room");

// The agent will automatically:
// - Listen for speech
// - Transcribe with Deepgram
// - Generate responses with Cerebras
// - Speak responses with Deepgram TTS
```

## Event Types

The agent emits these events:

- `connected` - Successfully connected to room
- `disconnected` - Disconnected from room
- `participant_joined` - User joined the room
- `participant_left` - User left the room
- `speech_started` - User started speaking
- `speech_ended` - User finished speaking (with transcript)
- `transcript` - New transcript segment (user or agent)
- `thinking` - Agent is generating response
- `response` - Agent spoke a response
- `error` - Error occurred

## Pipeline Flow

1. **Audio Capture**: Agent subscribes to audio tracks from participants
2. **Speech Detection**: Deepgram STT detects speech start/end
3. **Transcription**: Audio streamed to Deepgram, transcripts received
4. **Context Building**: Conversation history maintained for context
5. **LLM Generation**: Transcript sent to Cerebras with conversation history
6. **Response Synthesis**: LLM response converted to speech via Deepgram TTS
7. **Audio Playback**: Synthesized audio played back to room

## Latency Breakdown

| Stage | Latency | Notes |
|-------|---------|-------|
| Audio capture | ~50ms | WebRTC transport |
| STT (Deepgram) | ~200ms | Streaming transcription |
| LLM (Cerebras) | ~80-150ms | ~2200 tokens/sec |
| TTS (Deepgram) | ~100-200ms | Streaming synthesis |
| Audio playback | ~50ms | WebRTC transport |
| **Total** | **~400-600ms** | Sub-second response |

## Files

- `src/index.ts` - Main entry point and CLI
- `src/agent.ts` - Core agent implementation
- `src/stt.ts` - Deepgram STT handler
- `src/tts.ts` - Deepgram TTS handler
- `src/llm.ts` - Cerebras LLM handler
- `src/types.ts` - TypeScript types

## Dependencies

- `@livekit/rtc-node` - LiveKit WebRTC SDK
- `livekit-server-sdk` - LiveKit server-side utilities
- `ws` - WebSocket client for Deepgram
- `dotenv` - Environment variable loading

## See Also

- [LiveKit Documentation](https://docs.livekit.io/)
- [Deepgram STT Docs](https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio)
- [Deepgram TTS Docs](https://developers.deepgram.com/docs/tts-rest)
- [Cerebras API Docs](https://inference-docs.cerebras.ai/)

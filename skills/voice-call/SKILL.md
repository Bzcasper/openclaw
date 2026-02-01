---
name: voice-call
description: Start voice calls via the OpenClaw voice-call plugin with Deepgram/LiveKit support.
metadata: {"openclaw":{"emoji":"📞","skillKey":"voice-call","requires":{"config":["plugins.entries.voice-call.enabled"]}}}
---

# Voice Call

Use the voice-call plugin to start or inspect calls via telephony (Twilio, Telnyx, Plivo) or WebRTC (LiveKit).

## Providers

### Telephony (Phone Calls)
- **Twilio**: `provider: "twilio"` + `twilio.accountSid/authToken` + `fromNumber`
- **Telnyx**: `provider: "telnyx"` + `telnyx.apiKey/connectionId` + `fromNumber`
- **Plivo**: `provider: "plivo"` + `plivo.authId/authToken` + `fromNumber`

### WebRTC (Browser/App)
- **LiveKit**: `provider: "livekit"` + `livekit.apiKey/apiSecret/wsUrl`

### Development
- **Mock**: `provider: "mock"` (no network)

## STT Providers (Speech-to-Text)

- **Deepgram**: `streaming.sttProvider: "deepgram"` + model `nova-3`
- **OpenAI Realtime**: `streaming.sttProvider: "openai-realtime"` + model `gpt-4o-transcribe`

## TTS Providers (Text-to-Speech)

- **Deepgram**: `tts.provider: "deepgram"` + Aura voices (asteria, luna, stella, etc.)
- **OpenAI**: `tts.provider: "openai"` + voices (alloy, coral, marin, etc.)
- **ElevenLabs**: `tts.provider: "elevenlabs"` + voice IDs

## CLI

```bash
openclaw voicecall call --to "+15555550123" --message "Hello from OpenClaw"
openclaw voicecall continue --call-id <id> --message "Any questions?"
openclaw voicecall speak --call-id <id> --message "One moment"
openclaw voicecall end --call-id <id>
openclaw voicecall status --call-id <id>
openclaw voicecall tail
```

## Tool

Use `voice_call` for agent-initiated calls.

Actions:
- `initiate_call` (message, to?, mode?)
- `continue_call` (callId, message)
- `speak_to_user` (callId, message)
- `end_call` (callId)
- `get_status` (callId)

## Example Config (Deepgram + LiveKit)

```json5
{
  provider: "livekit",
  livekit: {
    apiKey: "API...",
    apiSecret: "...",
    wsUrl: "wss://myproject.livekit.cloud"
  },
  streaming: {
    enabled: true,
    sttProvider: "deepgram",
    sttModel: "nova-3"
  },
  tts: {
    provider: "deepgram",
    deepgram: { model: "aura-asteria-en" }
  }
}
```

## Environment Variables

```bash
DEEPGRAM_API_KEY=dg_...      # Deepgram STT/TTS
LIVEKIT_API_KEY=API...       # LiveKit
LIVEKIT_API_SECRET=...       # LiveKit
OPENAI_API_KEY=sk-...        # OpenAI (LLM + optional TTS/STT)
TWILIO_ACCOUNT_SID=AC...     # Twilio
TWILIO_AUTH_TOKEN=...        # Twilio
```

## Notes

- Plugin config lives under `plugins.entries.voice-call.config`
- Deepgram TTS natively outputs mu-law 8kHz for telephony
- LiveKit uses WebRTC rooms - no webhook URL needed
- See `/providers/livekit-deepgram` for full setup guide

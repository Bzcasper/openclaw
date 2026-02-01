export type { VoiceCallProvider } from "./base.js";
export { MockProvider } from "./mock.js";

// OpenAI Realtime STT
export {
  OpenAIRealtimeSTTProvider,
  type RealtimeSTTConfig,
  type RealtimeSTTSession,
} from "./stt-openai-realtime.js";

// Deepgram STT (streaming)
export {
  DeepgramSTTProvider,
  type DeepgramSTTConfig,
  type DeepgramSTTSession,
} from "./stt-deepgram.js";

// Telephony providers
export { TelnyxProvider } from "./telnyx.js";
export { TwilioProvider } from "./twilio.js";
export { PlivoProvider } from "./plivo.js";

// LiveKit WebRTC provider
export { LiveKitProvider, type LiveKitConfig } from "./livekit.js";

// OpenAI TTS
export {
  OpenAITTSProvider,
  type OpenAITTSConfig,
  type OpenAITTSVoice,
  OPENAI_TTS_VOICES,
  mulawToLinear as openaiMulawToLinear,
  chunkAudio as openaiChunkAudio,
} from "./tts-openai.js";

// Deepgram TTS
export {
  DeepgramTTSProvider,
  type DeepgramTTSConfig,
  type DeepgramTTSVoice,
  DEEPGRAM_TTS_VOICES,
  mulawToLinear as deepgramMulawToLinear,
  chunkAudio as deepgramChunkAudio,
} from "./tts-deepgram.js";

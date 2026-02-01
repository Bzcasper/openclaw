/**
 * LiveKit Voice Agent Types
 */

export interface AgentConfig {
  /** LiveKit configuration */
  livekit: {
    wsUrl: string;
    apiKey: string;
    apiSecret: string;
  };
  /** Deepgram configuration */
  deepgram: {
    apiKey: string;
    sttModel?: string;
    ttsModel?: string;
    ttsVoice?: string;
  };
  /** Cerebras configuration */
  cerebras: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
  };
  /** Agent behavior settings */
  settings?: {
    /** System prompt for the LLM */
    systemPrompt?: string;
    /** VAD silence duration in ms (default: 800) */
    silenceDurationMs?: number;
    /** Response timeout in ms (default: 10000) */
    responseTimeoutMs?: number;
    /** Maximum conversation length in seconds (default: 300) */
    maxDurationSeconds?: number;
  };
}

export interface RoomConnection {
  roomName: string;
  token: string;
  participantId: string;
}

export interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  speaker: "user" | "agent";
  timestamp: number;
}

export interface ConversationState {
  roomName: string;
  participantId: string;
  startTime: number;
  transcripts: TranscriptSegment[];
  isListening: boolean;
  isSpeaking: boolean;
}

export type AgentEvent =
  | { type: "connected"; roomName: string }
  | { type: "disconnected"; roomName: string; reason?: string }
  | { type: "participant_joined"; participantId: string }
  | { type: "participant_left"; participantId: string }
  | { type: "speech_started"; participantId: string }
  | { type: "speech_ended"; participantId: string; transcript: string }
  | { type: "transcript"; segment: TranscriptSegment }
  | { type: "thinking"; participantId: string }
  | { type: "response"; participantId: string; text: string; audioDurationMs: number }
  | { type: "error"; error: Error; context?: string };

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

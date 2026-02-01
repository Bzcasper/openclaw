/**
 * LiveKit Voice Agent
 * 
 * Real-time voice AI agent that connects to LiveKit rooms and handles:
 * - Audio capture from participants
 * - Speech-to-text via Deepgram
 * - LLM responses via Cerebras
 * - Text-to-speech via Deepgram
 * - Audio playback to room
 */

import { 
  Room, 
  RoomEvent, 
  TrackKind, 
  AudioStream, 
  AudioFrame, 
  AudioSource, 
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import type { AgentConfig, AgentEvent, AgentEventHandler, ConversationState, TranscriptSegment } from "./types.js";
import { DeepgramSTTHandler } from "./stt.js";
import { DeepgramTTSHandler } from "./tts.js";
import { CerebrasLLMHandler } from "./llm.js";

export class LiveKitVoiceAgent {
  private config: AgentConfig;
  private room: Room | null = null;
  private stt: DeepgramSTTHandler | null = null;
  private tts: DeepgramTTSHandler;
  private llm: CerebrasLLMHandler;
  private eventHandlers: Set<AgentEventHandler> = new Set();
  private conversation: ConversationState | null = null;
  private isProcessing = false;
  private currentParticipantId: string | null = null;
  
  // Audio publishing
  private audioSource: AudioSource | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private isPublishingAudio = false;

  constructor(config: AgentConfig) {
    this.config = {
      settings: {
        systemPrompt: "You are a helpful voice assistant. Keep responses concise and conversational.",
        silenceDurationMs: 800,
        responseTimeoutMs: 10000,
        maxDurationSeconds: 300,
        ...config.settings,
      },
      ...config,
    };

    this.tts = new DeepgramTTSHandler({
      apiKey: config.deepgram.apiKey,
      model: config.deepgram.ttsVoice || "aura-asteria-en",
      encoding: "linear16",
      sampleRate: 48000,
    });

    this.llm = new CerebrasLLMHandler({
      apiKey: config.cerebras.apiKey,
      model: config.cerebras.model || "llama3.1-8b",
      baseUrl: config.cerebras.baseUrl,
      maxTokens: 150,
      temperature: 0.7,
    });
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("[Agent] Event handler error:", e);
      }
    }
  }

  /**
   * Generate access token for connecting to a room
   */
  async generateToken(roomName: string, participantId: string): Promise<string> {
    const token = new AccessToken(
      this.config.livekit.apiKey,
      this.config.livekit.apiSecret,
      {
        identity: participantId,
        ttl: "1h",
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await token.toJwt();
  }

  /**
   * Connect to a LiveKit room and start listening
   */
  async connect(roomName: string): Promise<void> {
    if (this.room) {
      throw new Error("Already connected to a room");
    }

    const participantId = `agent-${Date.now()}`;
    const token = await this.generateToken(roomName, participantId);

    this.room = new Room();
    
    // Set up event handlers
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`[Agent] Audio track subscribed from ${participant.identity}`);
        this.handleAudioTrack(track, participant.identity);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log(`[Agent] Audio track unsubscribed from ${participant.identity}`);
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`[Agent] Participant connected: ${participant.identity}`);
      this.emit({ type: "participant_joined", participantId: participant.identity });
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`[Agent] Participant disconnected: ${participant.identity}`);
      this.emit({ type: "participant_left", participantId: participant.identity });
    });

    // Connect to room
    await this.room.connect(this.config.livekit.wsUrl, token, {
      autoSubscribe: true,
      dynacast: true,
    });
    
    // Initialize audio publishing
    await this.initializeAudioPublishing();
    
    this.conversation = {
      roomName,
      participantId,
      startTime: Date.now(),
      transcripts: [],
      isListening: false,
      isSpeaking: false,
    };

    console.log(`[Agent] Connected to room: ${roomName}`);
    this.emit({ type: "connected", roomName });

    // Set up STT
    await this.initializeSTT();
  }

  /**
   * Initialize audio source and track for publishing
   */
  private async initializeAudioPublishing(): Promise<void> {
    const room = this.room;
    if (!room) {
      throw new Error("Room not connected");
    }
    
    const localParticipant = room.localParticipant;
    if (!localParticipant) {
      throw new Error("Local participant not available");
    }
    
    // Create audio source at 48kHz, mono (1 channel)
    const sampleRate = 48000;
    const channels = 1;
    
    this.audioSource = new AudioSource(sampleRate, channels);
    this.audioTrack = LocalAudioTrack.createAudioTrack("agent-audio", this.audioSource);
    
    // Publish the track
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    
    await localParticipant.publishTrack(this.audioTrack, options);
    console.log("[Agent] Audio track published successfully");
  }

  private async initializeSTT(): Promise<void> {
    this.stt = new DeepgramSTTHandler(
      {
        apiKey: this.config.deepgram.apiKey,
        model: this.config.deepgram.sttModel || "nova-3",
        endpointingMs: this.config.settings?.silenceDurationMs,
      },
      {
        onSpeechStart: () => {
          console.log("[Agent] Speech started");
          if (this.currentParticipantId) {
            this.emit({ type: "speech_started", participantId: this.currentParticipantId });
          }
          this.conversation!.isListening = true;
        },
        onTranscript: (text, isFinal) => {
          if (isFinal && text.trim()) {
            console.log(`[Agent] Transcript: ${text}`);
            this.handleFinalTranscript(text);
          }
        },
        onError: (error) => {
          console.error("[Agent] STT error:", error);
          this.emit({ type: "error", error, context: "stt" });
        },
      }
    );

    await this.stt.connect();
  }

  private handleAudioTrack(track: any, participantId: string): void {
    this.currentParticipantId = participantId;
    
    const audioStream = new AudioStream(track);
    
    // Process audio frames
    const processFrames = async () => {
      for await (const frame of audioStream) {
        if (this.stt && this.conversation?.isListening) {
          // Convert AudioFrame to Buffer and send to STT
          const audioData = this.audioFrameToBuffer(frame);
          this.stt.sendAudio(audioData);
        }
      }
    };

    processFrames().catch((error) => {
      console.error("[Agent] Audio processing error:", error);
    });
  }

  private audioFrameToBuffer(frame: AudioFrame): Buffer {
    // AudioFrame data is typically Int16Array (16-bit PCM)
    // @ts-ignore - AudioFrame has data property which is Int16Array
    return Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  }

  private async handleFinalTranscript(text: string): Promise<void> {
    if (!this.conversation || this.isProcessing) return;

    this.isProcessing = true;
    this.conversation.isListening = false;

    // Add user transcript
    const segment: TranscriptSegment = {
      text,
      isFinal: true,
      speaker: "user",
      timestamp: Date.now(),
    };
    this.conversation.transcripts.push(segment);
    this.emit({ type: "transcript", segment });

    // Generate response
    await this.generateAndSpeakResponse(text);

    this.isProcessing = false;
    this.conversation.isListening = true;
  }

  private async generateAndSpeakResponse(userText: string): Promise<void> {
    if (!this.currentParticipantId) return;

    this.emit({ type: "thinking", participantId: this.currentParticipantId });

    try {
      // Build conversation history
      const history = this.conversation!.transcripts
        .filter((t) => t.isFinal)
        .slice(-10) // Keep last 10 exchanges
        .map((t) => ({
          speaker: t.speaker,
          text: t.text,
        }));

      // Generate LLM response
      const messages = this.llm.createConversationPrompt(
        this.config.settings!.systemPrompt!,
        history.slice(0, -1), // Exclude the message we just added
        userText
      );

      const startTime = Date.now();
      const { text: responseText, latencyMs } = await this.llm.generateResponse(messages);
      
      console.log(`[Agent] LLM response (${latencyMs}ms): ${responseText}`);

      // Add agent transcript
      const agentSegment: TranscriptSegment = {
        text: responseText,
        isFinal: true,
        speaker: "agent",
        timestamp: Date.now(),
      };
      this.conversation!.transcripts.push(agentSegment);
      this.emit({ type: "transcript", segment: agentSegment });

      // Synthesize and play audio
      this.conversation!.isSpeaking = true;
      const audioStartTime = Date.now();
      
      await this.speak(responseText);
      
      const audioDurationMs = Date.now() - audioStartTime;
      
      this.emit({
        type: "response",
        participantId: this.currentParticipantId,
        text: responseText,
        audioDurationMs,
      });

      this.conversation!.isSpeaking = false;
    } catch (error) {
      console.error("[Agent] Response generation error:", error);
      this.emit({
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
        context: "response_generation",
      });
    }
  }

  /**
   * Synthesize text to speech and play in the room
   */
  private async speak(text: string): Promise<void> {
    console.log(`[Agent] Speaking: ${text}`);
    
    if (!this.audioSource) {
      throw new Error("Audio source not initialized");
    }
    
    if (this.isPublishingAudio) {
      console.warn("[Agent] Already publishing audio, waiting...");
      // Wait for current audio to finish
      while (this.isPublishingAudio) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    try {
      this.isPublishingAudio = true;
      
      // Generate audio from TTS
      const audioBuffer = await this.tts.synthesize(text);
      console.log(`[Agent] Generated ${audioBuffer.length} bytes of audio`);
      
      // Stream audio to LiveKit
      await this.streamAudioToRoom(audioBuffer);
      
    } catch (error) {
      console.error("[Agent] TTS or audio publishing error:", error);
      throw error;
    } finally {
      this.isPublishingAudio = false;
    }
  }

  /**
   * Stream audio buffer to LiveKit room
   */
  private async streamAudioToRoom(audioBuffer: Buffer): Promise<void> {
    if (!this.audioSource) {
      throw new Error("Audio source not available");
    }
    
    const sampleRate = 48000;
    const channels = 1;
    const bytesPerSample = 2; // 16-bit
    
    // Calculate frame size for 10ms chunks
    const frameDurationMs = 10;
    const samplesPerFrame = Math.floor((sampleRate * frameDurationMs) / 1000);
    const bytesPerFrame = samplesPerFrame * channels * bytesPerSample;
    
    console.log(`[Agent] Streaming ${audioBuffer.length} bytes in ${Math.ceil(audioBuffer.length / bytesPerFrame)} frames`);
    
    // Stream audio frames
    let offset = 0;
    let frameCount = 0;
    
    while (offset < audioBuffer.length) {
      const remaining = audioBuffer.length - offset;
      const frameSize = Math.min(bytesPerFrame, remaining);
      
      // Extract frame data
      const frameData = audioBuffer.subarray(offset, offset + frameSize);
      
      // Convert to Int16Array
      const samples = new Int16Array(frameData.buffer, frameData.byteOffset, frameData.length / 2);
      
      // Calculate actual samples per channel for this frame
      const samplesPerChannel = Math.floor(samples.length / channels);
      
      // Create AudioFrame
      const frame = new AudioFrame(
        samples,
        sampleRate,
        channels,
        samplesPerChannel
      );
      
      // Capture frame to send to LiveKit
      await this.audioSource.captureFrame(frame);
      
      offset += frameSize;
      frameCount++;
      
      // Small delay to simulate real-time streaming (prevents overwhelming the connection)
      if (frameCount % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    console.log(`[Agent] Streamed ${frameCount} audio frames`);
    
    // Add a small silence buffer at the end to prevent audio cut-off
    const silenceSamples = new Int16Array(samplesPerFrame * channels);
    const silenceFrame = new AudioFrame(silenceSamples, sampleRate, channels, samplesPerFrame);
    await this.audioSource.captureFrame(silenceFrame);
    
    // Wait for audio to finish playing (based on duration)
    const durationMs = (audioBuffer.length / (sampleRate * bytesPerSample)) * 1000;
    console.log(`[Agent] Audio duration: ${durationMs.toFixed(0)}ms`);
  }

  /**
   * Disconnect from room and cleanup
   */
  async disconnect(): Promise<void> {
    // Note: Audio track will be automatically unpublished when room disconnects
    // Explicit unpublishing can cause protobuf encoding issues in some SDK versions
    
    // Clear references
    this.audioSource = null;
    this.audioTrack = null;
    
    // Close STT
    if (this.stt) {
      this.stt.close();
      this.stt = null;
    }

    // Disconnect from room
    if (this.room) {
      const roomName = this.conversation?.roomName || "unknown";
      await this.room.disconnect();
      this.room = null;
      this.emit({ type: "disconnected", roomName });
    }

    this.conversation = null;
    this.isProcessing = false;
    this.isPublishingAudio = false;
  }

  /**
   * Get current conversation state
   */
  getConversationState(): ConversationState | null {
    return this.conversation ? { ...this.conversation } : null;
  }
}

/**
 * Deepgram Streaming STT Handler
 * 
 * Manages WebSocket connection to Deepgram for real-time transcription
 */

import WebSocket from "ws";

export interface STTConfig {
  apiKey: string;
  model?: string;
  language?: string;
  endpointingMs?: number;
  interimResults?: boolean;
}

export interface STTCallbacks {
  onSpeechStart: () => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
}

export class DeepgramSTTHandler {
  private ws: WebSocket | null = null;
  private config: STTConfig;
  private callbacks: STTCallbacks;
  private connected = false;
  private closed = false;
  private pendingTranscript = "";
  private reconnectAttempts = 0;
  private readonly maxReconnects = 5;

  constructor(config: STTConfig, callbacks: STTCallbacks) {
    this.config = {
      model: "nova-3",
      language: "en",
      endpointingMs: 800,
      interimResults: true,
      ...config,
    };
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (this.connected || this.closed) return;
    
    const params = new URLSearchParams({
      model: this.config.model!,
      language: this.config.language!,
      encoding: "linear16",
      sample_rate: "48000",
      channels: "1",
      endpointing: String(this.config.endpointingMs),
      interim_results: String(this.config.interimResults),
      punctuate: "true",
      vad_events: "true",
      smart_format: "true",
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        console.log("[STT] Deepgram WebSocket connected");
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (e) {
          console.error("[STT] Failed to parse message:", e);
        }
      });

      this.ws.on("error", (error) => {
        console.error("[STT] WebSocket error:", error);
        if (!this.connected) {
          reject(error);
        } else {
          this.callbacks.onError(error);
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        if (!this.closed && this.reconnectAttempts < this.maxReconnects) {
          this.reconnectAttempts++;
          const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[STT] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error("STT connection timeout"));
        }
      }, 10000);
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case "SpeechStarted":
        this.pendingTranscript = "";
        this.callbacks.onSpeechStart();
        break;

      case "Results": {
        const result = message.channel?.alternatives?.[0];
        if (!result?.transcript) return;

        const transcript = result.transcript;
        const isFinal = message.is_final;
        const speechFinal = message.speech_final;

        if (isFinal) {
          this.pendingTranscript += transcript + " ";
          
          if (speechFinal) {
            const finalText = this.pendingTranscript.trim();
            this.callbacks.onTranscript(finalText, true);
            this.pendingTranscript = "";
          } else {
            this.callbacks.onTranscript(this.pendingTranscript.trim(), false);
          }
        } else {
          // Interim result
          const interimText = this.pendingTranscript + transcript;
          this.callbacks.onTranscript(interimText.trim(), false);
        }
        break;
      }

      case "UtteranceEnd":
        if (this.pendingTranscript.trim()) {
          this.callbacks.onTranscript(this.pendingTranscript.trim(), true);
          this.pendingTranscript = "";
        }
        break;
    }
  }

  sendAudio(audioData: Buffer): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(audioData);
  }

  close(): void {
    this.closed = true;
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

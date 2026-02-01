/**
 * Deepgram TTS Handler
 * 
 * Generates speech from text using Deepgram's TTS API
 */

export interface TTSConfig {
  apiKey: string;
  model?: string;
  encoding?: "linear16" | "mulaw" | "alaw";
  sampleRate?: number;
}

export class DeepgramTTSHandler {
  private config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = {
      model: "aura-asteria-en",
      encoding: "linear16",
      sampleRate: 48000,
      ...config,
    };
  }

  async synthesize(text: string): Promise<Buffer> {
    const params = new URLSearchParams({
      model: this.config.model!,
      encoding: this.config.encoding!,
      sample_rate: this.config.sampleRate!.toString(),
      container: "none",
    });

    const response = await fetch(
      `https://api.deepgram.com/v1/speak?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "audio/linear16",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deepgram TTS failed: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Synthesize text and stream audio chunks
   */
  async *synthesizeStream(text: string, chunkSizeMs = 20): AsyncGenerator<Buffer> {
    const audio = await this.synthesize(text);
    
    // Calculate chunk size in bytes (48kHz, 16-bit, mono = 96000 bytes/sec)
    const bytesPerMs = (this.config.sampleRate! * 2) / 1000; // 16-bit = 2 bytes
    const chunkSize = Math.floor(chunkSizeMs * bytesPerMs);
    
    for (let i = 0; i < audio.length; i += chunkSize) {
      yield audio.subarray(i, Math.min(i + chunkSize, audio.length));
    }
  }

  getSampleRate(): number {
    return this.config.sampleRate!;
  }

  getEncoding(): string {
    return this.config.encoding!;
  }
}

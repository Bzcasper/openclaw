/**
 * Cerebras LLM Handler
 * 
 * Ultra-fast LLM responses for real-time voice conversations
 */

export interface LLMConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class CerebrasLLMHandler {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      model: "llama3.1-8b",
      baseUrl: "https://api.cerebras.ai/v1",
      maxTokens: 150,
      temperature: 0.7,
      ...config,
    };
  }

  async generateResponse(messages: ChatMessage[]): Promise<{
    text: string;
    tokensUsed: number;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras LLM failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;

    return { text, tokensUsed, latencyMs };
  }

  /**
   * Create a conversation prompt with system context
   */
  createConversationPrompt(
    systemPrompt: string,
    conversationHistory: Array<{ speaker: "user" | "agent"; text: string }>,
    newUserMessage: string
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const entry of conversationHistory) {
      messages.push({
        role: entry.speaker === "user" ? "user" : "assistant",
        content: entry.text,
      });
    }

    messages.push({ role: "user", content: newUserMessage });

    return messages;
  }
}

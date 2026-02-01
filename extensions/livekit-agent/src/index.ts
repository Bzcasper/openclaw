/**
 * LiveKit Voice Agent - Main Entry Point
 * 
 * Starts the agent and manages room connections
 */

import { config } from "dotenv";
import { LiveKitVoiceAgent } from "./agent.js";
import type { AgentConfig, AgentEvent } from "./types.js";

// Load environment variables - try multiple locations
import { existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Try to find .env.local in various locations
const possibleEnvPaths = [
  ".env.local", // Current directory
  resolve(process.cwd(), ".env.local"), // Process working directory
  resolve(__dirname, "../../../.env.local"), // openclaw root (3 levels up from dist/src)
  resolve(__dirname, "../../.env.local"), // Fallback
  "/root/openclaw/.env.local", // Absolute path for testing
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`[Agent] Loaded environment from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn("[Agent] Warning: .env.local not found, relying on environment variables");
}

function getConfig(): AgentConfig {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const cerebrasApiKey = process.env.CEREBRAS_API_KEY;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    throw new Error(
      "Missing LiveKit configuration. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET"
    );
  }

  if (!deepgramApiKey) {
    throw new Error("Missing Deepgram API key. Set DEEPGRAM_API_KEY");
  }

  if (!cerebrasApiKey) {
    throw new Error("Missing Cerebras API key. Set CEREBRAS_API_KEY");
  }

  return {
    livekit: {
      wsUrl: livekitUrl,
      apiKey: livekitApiKey,
      apiSecret: livekitApiSecret,
    },
    deepgram: {
      apiKey: deepgramApiKey,
      sttModel: process.env.DEEPGRAM_STT_MODEL || "nova-3",
      ttsVoice: process.env.DEEPGRAM_TTS_VOICE || "aura-asteria-en",
    },
    cerebras: {
      apiKey: cerebrasApiKey,
      model: process.env.CEREBRAS_MODEL || "llama3.1-8b",
      baseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
    },
    settings: {
      systemPrompt:
        process.env.AGENT_SYSTEM_PROMPT ||
        "You are a helpful voice assistant. Keep responses concise and conversational.",
      silenceDurationMs: parseInt(process.env.AGENT_SILENCE_DURATION_MS || "800", 10),
      responseTimeoutMs: parseInt(process.env.AGENT_RESPONSE_TIMEOUT_MS || "10000", 10),
      maxDurationSeconds: parseInt(process.env.AGENT_MAX_DURATION_SECONDS || "300", 10),
    },
  };
}

function formatEvent(event: AgentEvent): string {
  const timestamp = new Date().toISOString();
  switch (event.type) {
    case "connected":
      return `[${timestamp}] ✅ Connected to room: ${event.roomName}`;
    case "disconnected":
      return `[${timestamp}] ❌ Disconnected from room: ${event.roomName}${event.reason ? ` (${event.reason})` : ""}`;
    case "participant_joined":
      return `[${timestamp}] 👤 Participant joined: ${event.participantId}`;
    case "participant_left":
      return `[${timestamp}] 👋 Participant left: ${event.participantId}`;
    case "speech_started":
      return `[${timestamp}] 🎤 Speech started: ${event.participantId}`;
    case "speech_ended":
      return `[${timestamp}] ✋ Speech ended: ${event.participantId} - "${event.transcript.slice(0, 50)}..."`;
    case "transcript":
      return `[${timestamp}] 📝 ${event.segment.speaker}: ${event.segment.text}`;
    case "thinking":
      return `[${timestamp}] 🤔 Thinking...`;
    case "response":
      return `[${timestamp}] 💬 Response (${event.audioDurationMs}ms): ${event.text}`;
    case "error":
      return `[${timestamp}] ❌ Error${event.context ? ` [${event.context}]` : ""}: ${event.error.message}`;
    default:
      return `[${timestamp}] 📋 ${JSON.stringify(event)}`;
  }
}

async function main() {
  console.log("\n🎤 LiveKit Voice Agent\n");
  console.log("=".repeat(50));

  let config: AgentConfig;
  try {
    config = getConfig();
  } catch (error) {
    console.error("Configuration error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log("\n📡 Configuration:");
  console.log(`  LiveKit: ${config.livekit.wsUrl}`);
  console.log(`  Deepgram STT: ${config.deepgram.sttModel}`);
  console.log(`  Deepgram TTS: ${config.deepgram.ttsVoice}`);
  console.log(`  Cerebras: ${config.cerebras.model}`);
  console.log(`  System: ${config.settings?.systemPrompt?.slice(0, 50)}...`);

  // Get room name from command line or environment
  const roomName = process.argv[2] || process.env.AGENT_ROOM_NAME || `voice-${Date.now()}`;
  
  console.log(`\n🎯 Target room: ${roomName}`);
  console.log("=".repeat(50) + "\n");

  // Create agent
  const agent = new LiveKitVoiceAgent(config);

  // Subscribe to events
  agent.onEvent((event) => {
    console.log(formatEvent(event));
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    await agent.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Connect to room
  try {
    await agent.connect(roomName);
    
    // Keep running
    console.log("\n✅ Agent is running. Press Ctrl+C to stop.\n");
    
    // Keep alive
    await new Promise(() => {
      // Infinite wait - agent runs until signal
    });
  } catch (error) {
    console.error("Failed to start agent:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);

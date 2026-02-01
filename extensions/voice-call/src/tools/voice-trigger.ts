/**
 * Voice Agent Trigger Tool
 * 
 * Allows triggering voice calls via Telegram/WhatsApp messages.
 * The agent can:
 * 1. Call your cell phone (via Twilio)
 * 2. Join a LiveKit room (for app-based voice)
 * 
 * Usage in Telegram/WhatsApp:
 * - "call me" → Calls your cell phone
 * - "voice chat" → Creates LiveKit room for app-based conversation
 */

import type { Tool } from "../types.js";

export interface VoiceTriggerInput {
  /** Type of voice interaction */
  mode: "phone_call" | "livekit_room";
  /** Phone number to call (E.164 format, e.g., +1234567890) */
  phoneNumber?: string;
  /** Initial message when connected */
  message?: string;
  /** Room name for LiveKit mode */
  roomName?: string;
}

export interface VoiceTriggerOutput {
  success: boolean;
  callId?: string;
  roomName?: string;
  roomUrl?: string;
  error?: string;
}

export const voiceTriggerTool: Tool<VoiceTriggerInput, VoiceTriggerOutput> = {
  name: "voice_trigger",
  description: "Trigger a voice conversation - either call a phone number or create a LiveKit room",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["phone_call", "livekit_room"],
        description: "Type of voice interaction: phone_call uses Twilio, livekit_room uses WebRTC",
      },
      phoneNumber: {
        type: "string",
        description: "Phone number to call (E.164 format, e.g., +1234567890). Required for phone_call mode.",
      },
      message: {
        type: "string",
        description: "Initial message to speak when the call connects",
        default: "Hello! I'm your AI assistant. How can I help you today?",
      },
      roomName: {
        type: "string",
        description: "Room name for LiveKit mode. If not provided, a unique name will be generated.",
      },
    },
    required: ["mode"],
  },
  
  async execute(input: VoiceTriggerInput): Promise<VoiceTriggerOutput> {
    const { mode, phoneNumber, message, roomName } = input;
    
    if (mode === "phone_call") {
      if (!phoneNumber) {
        return {
          success: false,
          error: "phoneNumber is required for phone_call mode",
        };
      }
      
      // Use the voice-call plugin to initiate a call
      try {
        // This will be handled by the voice-call plugin's runtime
        const result = await globalThis.openclaw?.gateway?.request("voicecall.initiate", {
          to: phoneNumber,
          message: message || "Hello! I'm your AI assistant. How can I help you today?",
          mode: "conversation",
        });
        
        if (result?.success) {
          return {
            success: true,
            callId: result.callId,
          };
        } else {
          return {
            success: false,
            error: result?.error || "Failed to initiate call",
          };
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    
    if (mode === "livekit_room") {
      // Generate a unique room name
      const finalRoomName = roomName || `voice-${Date.now()}`;
      
      // Start the LiveKit agent
      try {
        // Launch the livekit-agent process
        const { spawn } = await import("child_process");
        const { fileURLToPath } = await import("url");
        const { dirname, join } = await import("path");
        
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const agentPath = join(__dirname, "../../livekit-agent/dist/index.js");
        
        const agent = spawn("node", [agentPath, finalRoomName], {
          detached: true,
          stdio: "ignore",
        });
        
        agent.unref();
        
        // Generate a token for the user to join
        const { AccessToken } = await import("livekit-server-sdk");
        const token = new AccessToken(
          process.env.LIVEKIT_API_KEY!,
          process.env.LIVEKIT_API_SECRET!,
          {
            identity: `user-${Date.now()}`,
            ttl: "1h",
          }
        );
        
        token.addGrant({
          roomJoin: true,
          room: finalRoomName,
          canPublish: true,
          canSubscribe: true,
        });
        
        const jwt = await token.toJwt();
        
        return {
          success: true,
          roomName: finalRoomName,
          roomUrl: `${process.env.LIVEKIT_URL}?token=${jwt}`,
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    
    return {
      success: false,
      error: `Unknown mode: ${mode}`,
    };
  },
};

export default voiceTriggerTool;

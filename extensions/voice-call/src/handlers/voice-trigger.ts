/**
 * Voice Trigger Handler
 * 
 * Handles Telegram/WhatsApp commands to trigger voice sessions:
 * - "call me" -> Initiates phone call via Twilio
 * - "voice chat" -> Creates LiveKit room and starts agent
 * - "call <number>" -> Call specific number
 * 
 * This enables messaging apps to control voice interactions.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { AccessToken } from "livekit-server-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface VoiceTriggerContext {
  userId: string;
  userPhone?: string;
  message: string;
  reply: (text: string) => Promise<void>;
}

export class VoiceTriggerHandler {
  private livekitUrl: string;
  private livekitApiKey: string;
  private livekitApiSecret: string;

  constructor() {
    this.livekitUrl = process.env.LIVEKIT_URL || "";
    this.livekitApiKey = process.env.LIVEKIT_API_KEY || "";
    this.livekitApiSecret = process.env.LIVEKIT_API_SECRET || "";
  }

  /**
   * Process incoming message for voice triggers
   */
  async handleMessage(ctx: VoiceTriggerContext): Promise<boolean> {
    const { message, reply, userPhone } = ctx;
    const lowerMsg = message.toLowerCase().trim();

    // Handle "call me" - call user's phone
    if (lowerMsg === "call me" || lowerMsg === "call") {
      if (!userPhone) {
        await reply("❌ I don't have your phone number. Please set it up first.");
        return true;
      }
      
      await this.initiatePhoneCall(userPhone, reply);
      return true;
    }

    // Handle "voice chat" or "voice" - start LiveKit session
    if (lowerMsg === "voice chat" || lowerMsg === "voice" || lowerMsg === "talk") {
      await this.startVoiceChat(ctx);
      return true;
    }

    // Handle "call <number>" - call specific number
    const callMatch = message.match(/call\s+(\+?[\d\s\-\(\)]+)/i);
    if (callMatch) {
      const phoneNumber = callMatch[1].replace(/\s/g, "");
      await this.initiatePhoneCall(phoneNumber, reply);
      return true;
    }

    // Not a voice command
    return false;
  }

  /**
   * Initiate phone call via voice-call plugin
   */
  private async initiatePhoneCall(phoneNumber: string, reply: (text: string) => Promise<void>): Promise<void> {
    try {
      await reply(`📞 Calling ${phoneNumber}...`);
      
      // Use the voice-call CLI to initiate call
      const { spawn } = await import("child_process");
      
      const child = spawn("openclaw", [
        "voicecall", "call",
        "--to", phoneNumber,
        "--message", "Hello! I'm your AI assistant. How can I help you today?",
        "--mode", "conversation",
        "--json"
      ], {
        cwd: "/root/openclaw",
        shell: true,
      });

      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        child.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              if (result.callId) {
                reply(`✅ Call initiated! ID: ${result.callId}`);
              } else {
                reply(`⚠️ Call may have started but got unexpected response`);
              }
            } catch {
              reply(`✅ Call initiated`);
            }
            resolve();
          } else {
            reject(new Error(`Call failed with code ${code}`));
          }
        });
        
        child.on("error", reject);
      });

    } catch (error) {
      console.error("[VoiceTrigger] Call initiation failed:", error);
      await reply(`❌ Failed to initiate call: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Start LiveKit voice chat session
   */
  private async startVoiceChat(ctx: VoiceTriggerContext): Promise<void> {
    try {
      const roomName = `voice-${ctx.userId}-${Date.now()}`;
      
      await ctx.reply(`🎤 Starting voice session...`);

      // Start the LiveKit agent
      const agentPath = join(__dirname, "../../livekit-agent/dist/index.js");
      
      const agent = spawn("node", [agentPath, roomName], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });

      agent.unref();

      // Generate access token for user
      const token = await this.generateToken(roomName, ctx.userId);
      
      // Create join URL
      const baseUrl = this.livekitUrl.replace("wss://", "https://").replace(".livekit.cloud", ".livekit.cloud");
      const joinUrl = `${baseUrl}/meet?token=${encodeURIComponent(token)}&url=${encodeURIComponent(this.livekitUrl)}`;

      await ctx.reply(`✅ Voice session ready!`);
      await ctx.reply(`📱 Click to join: ${joinUrl}`);
      await ctx.reply(`🎙️ Room: ${roomName}`);
      await ctx.reply(`\n💡 Tips:`);
      await ctx.reply(`   - Allow microphone access when prompted`);
      await ctx.reply(`   - Use headphones for best experience`);
      await ctx.reply(`   - Say "hello" when you join!`);

    } catch (error) {
      console.error("[VoiceTrigger] Voice chat start failed:", error);
      await ctx.reply(`❌ Failed to start voice chat: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Generate LiveKit access token
   */
  private async generateToken(roomName: string, userId: string): Promise<string> {
    const token = new AccessToken(
      this.livekitApiKey,
      this.livekitApiSecret,
      {
        identity: `user-${userId}`,
        ttl: "1h",
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    return await token.toJwt();
  }
}

export default VoiceTriggerHandler;

#!/usr/bin/env tsx
/**
 * Voice Agent Setup Wizard
 * 
 * Run: npx tsx scripts/setup-voice-agent.ts
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

console.log("\n🎤 Voice Agent Setup Wizard\n");
console.log("=" .repeat(50));

// Check current config
const envPath = resolve("/root/openclaw/.env.local");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

console.log("\n📋 Current Configuration:");

const hasLivekit = envContent.includes("LIVEKIT_URL");
const hasDeepgram = envContent.includes("DEEPGRAM_API_KEY");
const hasCerebras = envContent.includes("CEREBRAS_API_KEY");
const hasTwilio = envContent.includes("TWILIO_ACCOUNT_SID");

console.log(`  LiveKit: ${hasLivekit ? "✅ Configured" : "❌ Missing"}`);
console.log(`  Deepgram: ${hasDeepgram ? "✅ Configured" : "❌ Missing"}`);
console.log(`  Cerebras: ${hasCerebras ? "✅ Configured" : "❌ Missing"}`);
console.log(`  Twilio: ${hasTwilio ? "✅ Configured" : "❌ Missing (needed for phone calls)"}`);

console.log("\n" + "=".repeat(50));

if (hasTwilio) {
  console.log("\n✅ You can make phone calls!");
  console.log("\n🚀 Quick Start:");
  console.log("  openclaw voicecall call --to +YOUR_NUMBER --message \"Hello!\"");
} else {
  console.log("\n📞 To enable phone calls, add Twilio credentials to .env.local:");
  console.log("\n  TWILIO_ACCOUNT_SID=ACxxxxxxxx");
  console.log("  TWILIO_AUTH_TOKEN=xxxxxxxx");
  console.log("  TWILIO_FROM_NUMBER=+1234567890");
  console.log("  MY_PHONE_NUMBER=+19876543210");
  console.log("\nGet these from: https://www.twilio.com/console");
}

console.log("\n📱 For LiveKit mobile app:");
console.log("  1. Build app with LiveKit SDK");
console.log("  2. Start agent: openclaw voicecall agent my-room");
console.log("  3. Connect app to the room");

console.log("\n💬 For Telegram/WhatsApp:");
console.log("  1. Add TELEGRAM_BOT_TOKEN to .env.local");
console.log("  2. Run: openclaw channels telegram start");
console.log("  3. Message your bot: \"call me\"");

console.log("\n" + "=".repeat(50));
console.log("\n📖 Full guide: docs/voice-agent-setup-guide.md");
console.log("\n");

# Your Voice Agent - Complete Setup Guide

## 🎯 Your Goal
Have an AI voice agent that:
1. Can **call your cell phone** when you want to talk
2. Can be triggered via **Telegram or WhatsApp**
3. Has **natural voice conversations** using AI

## ✅ What You Already Have (Working!)

Your system is already configured with:
- ✅ **LiveKit** - WebRTC for web/app voice (wss://aitoolpool-7b5eca5f.livekit.cloud)
- ✅ **Deepgram** - Speech-to-text and text-to-speech (Nova-3, Aura voices)
- ✅ **Cerebras** - Ultra-fast AI responses (~2200 tokens/sec, ~250ms latency)
- ✅ **LiveKit Voice Agent** - Complete agent implementation in `extensions/livekit-agent/`

**Tested and working** - All components pass tests and connect successfully.

---

## 🚀 Three Ways to Use Your Voice Agent

### Option 1: Phone Calls (Easiest - Recommended) 📞

**How it works:** The agent calls your actual phone number using Twilio. You answer and talk normally.

**What you need:**
1. Twilio account (free to start, $1/month for phone number)
2. Add Twilio credentials to `.env.local`
3. Configure voice-call plugin for Twilio

**Setup:**
```bash
# 1. Sign up at twilio.com and get:
#    - Account SID
#    - Auth Token  
#    - A phone number

# 2. Add to /root/openclaw/.env.local:
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890  # Your Twilio number

# 3. Update openclaw.json5 to use Twilio:
```

**Usage:**
```bash
# Call yourself
openclaw voicecall call --to +19876543210 --message "Hello! How can I help you today?"

# Or via Telegram/WhatsApp (once configured):
# Just message: "call me"
```

**Pros:**
- Works with any phone
- No app to install
- Most reliable connection

**Cons:**
- Costs ~$0.01-0.02/minute
- Audio quality limited by phone network

---

### Option 2: LiveKit Mobile App (Best Quality) 📱

**How it works:** You build a simple mobile app using LiveKit's SDK. The agent joins the same room. Crystal-clear WebRTC audio.

**What you need:**
1. Build a mobile app (React Native, Swift, or Kotlin)
2. Start the agent: `openclaw voicecall agent my-room`
3. Connect your app to the room

**Setup:**
```bash
# 1. Start the agent
cd /root/openclaw/extensions/livekit-agent
npm start my-room-name

# 2. Build mobile app with LiveKit SDK
# See docs/voice-agent-setup-guide.md for code examples

# 3. Connect app to room
```

**Usage:**
- Open your app
- Tap "Connect"
- Start talking to the AI

**Pros:**
- HD audio quality
- Low latency (~400ms end-to-end)
- Free (just uses data)

**Cons:**
- Need to build/install an app
- Requires internet

---

### Option 3: Telegram/WhatsApp Hybrid (Most Convenient) 💬

**How it works:** You message your bot (e.g., "call me"), and the bot initiates a phone call or LiveKit session.

**What you need:**
1. Telegram bot token (free)
2. WhatsApp Business API (optional, more complex)
3. Configure OpenClaw to handle voice triggers

**Setup:**
```bash
# 1. Create Telegram bot via @BotFather
# 2. Add token to .env.local:
TELEGRAM_BOT_TOKEN=your_token_here

# 3. Configure in openclaw.json5
# 4. Start the bot:
openclaw channels telegram start
```

**Usage:**
```
You: call me
Bot: 📞 Calling you now...
[Your phone rings, you answer and talk to AI]

You: voice chat
Bot: 🎤 Starting voice session...
[Join via browser/app link]
```

**Pros:**
- Natural interface (just message)
- Works on any device with Telegram/WhatsApp
- Can fall back to text if needed

**Cons:**
- Telegram/WhatsApp don't support native voice bots
- Best for triggering, not the actual voice

---

## 💰 Cost Comparison

| Method | Setup Cost | Per Minute | Best For |
|--------|-----------|------------|----------|
| **Twilio Phone** | $1/month | ~$0.02 | Most convenient |
| **LiveKit App** | Free | $0.00 (data only) | Best quality |
| **Telegram Trigger** | Free | Variable | Easy access |

---

## 🎛️ Recommended: Hybrid Setup

Use **both** Twilio AND LiveKit for maximum flexibility:

### 1. Twilio for Phone Calls
Add to `.env.local`:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890
MY_PHONE_NUMBER=+19876543210
```

Update `openclaw.json5`:
```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "twilio",  // Use Twilio for phone calls
          fromNumber: "${TWILIO_FROM_NUMBER}",
          twilio: {
            accountSid: "${TWILIO_ACCOUNT_SID}",
            authToken: "${TWILIO_AUTH_TOKEN}",
          },
          // Keep LiveKit config for app-based voice
          livekit: {
            wsUrl: "${LIVEKIT_URL}",
            apiKey: "${LIVEKIT_API_KEY}",
            apiSecret: "${LIVEKIT_API_SECRET}",
          },
          streaming: {
            enabled: true,
            sttProvider: "deepgram",
            sttModel: "nova-3",
          },
          tts: {
            provider: "deepgram",
            deepgram: {
              model: "aura-asteria-en",
            },
          },
          responseModel: "cerebras/llama3.1-8b",
        },
      },
    },
  },
}
```

### 2. Telegram Bot for Triggers
Add to `.env.local`:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
```

Then you can message your bot:
- `"call me"` → Calls your phone
- `"voice chat"` → Starts LiveKit session

---

## 🚀 Quick Start (Choose Your Path)

### Path A: I want phone calls NOW
```bash
# 1. Get Twilio credentials from twilio.com
# 2. Add to .env.local
# 3. Update openclaw.json5 (change provider to "twilio")
# 4. Call yourself:
openclaw voicecall call --to +YOUR_NUMBER --message "Hello!"
```

### Path B: I want best audio quality
```bash
# 1. Build mobile app with LiveKit SDK
# 2. Start agent:
openclaw voicecall agent my-mobile-room
# 3. Connect app and talk
```

### Path C: I want Telegram/WhatsApp control
```bash
# 1. Create Telegram bot via @BotFather
# 2. Add TELEGRAM_BOT_TOKEN to .env.local
# 3. Configure Telegram in openclaw.json5
# 4. Start bot:
openclaw channels telegram start
# 5. Message your bot: "call me"
```

---

## 📊 What Happens During a Call

### For Phone Calls (Twilio):
```
You send command → OpenClaw initiates Twilio call
→ Your phone rings → You answer
→ Audio goes: You → Twilio → Deepgram STT → Cerebras LLM → Deepgram TTS → Twilio → Your phone
→ Latency: ~600-800ms (good for phone)
```

### For LiveKit (App):
```
App connects → Agent joins room
→ Audio goes: You → LiveKit WebRTC → Deepgram STT → Cerebras LLM → Deepgram TTS → LiveKit → You
→ Latency: ~400-600ms (excellent!)
```

---

## 🔧 Troubleshooting

**"Call failed"**
- Check Twilio credentials
- Verify fromNumber is valid Twilio number
- Check toNumber is E.164 format (+1234567890)

**"Agent won't start"**
- Check .env.local has LIVEKIT_URL, API_KEY, API_SECRET
- Run: `npx tsx extensions/livekit-agent/scripts/test-agent.ts`

**"Telegram bot not responding"**
- Verify TELEGRAM_BOT_TOKEN is correct
- Check bot is started: `openclaw channels telegram start`
- Make sure you've messaged the bot first

---

## 📁 Important Files

- `extensions/livekit-agent/` - Voice agent implementation
- `extensions/voice-call/` - Phone call integration
- `docs/voice-agent-setup-guide.md` - Detailed setup guide
- `scripts/setup-voice-agent.ts` - Setup wizard
- `scripts/test-voice-setup.ts` - Test all components

---

## ✅ Next Steps

1. **Decide which method(s) you want**
2. **Get Twilio credentials** (if doing phone calls)
3. **Update config files**
4. **Test the setup**
5. **Add Telegram bot** (optional, for convenience)

**Need help?** Check `docs/voice-agent-setup-guide.md` for detailed instructions.

---

## 💡 Summary

You have a **fully working voice agent** right now with LiveKit + Deepgram + Cerebras. To make it call your cell phone, just add Twilio credentials. To control it via Telegram/WhatsApp, add a bot token.

**The agent is production-ready. You just need to choose how you want to interact with it!**

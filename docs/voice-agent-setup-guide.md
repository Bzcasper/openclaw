# Voice Agent Setup for Cell Phone & Messaging Apps

This guide helps you set up a voice agent that can:
1. **Call your cell phone** (via Twilio)
2. **Talk through Telegram/WhatsApp** (via messaging triggers)
3. **Real-time voice in mobile apps** (via LiveKit)

## 🎯 Your Options

### Option A: Phone Calls (Best for Cell Phone) 📞
The agent **calls your actual phone number** using Twilio.

**Pros:**
- Works with any phone (no app needed)
- Uses regular cellular voice
- Most reliable

**Cons:**
- Requires Twilio account & phone number
- Costs ~$0.01/minute

### Option B: LiveKit Mobile App (Best Quality) 📱
Build a simple mobile app using LiveKit's SDKs for crystal-clear WebRTC voice.

**Pros:**
- HD audio quality
- Low latency (~400ms)
- Free (just data usage)

**Cons:**
- Need to build/install an app
- Requires internet connection

### Option C: Telegram/WhatsApp Voice (Hybrid) 💬
Use text commands to trigger phone calls or LiveKit sessions.

**Pros:**
- Natural interface (just message the bot)
- Can choose voice or text responses

**Cons:**
- Telegram/WhatsApp don't support real-time voice bots well
- Best used for **triggering** calls, not the voice itself

---

## 📞 Option A: Setup Phone Calls (Twilio)

### 1. Get Twilio Credentials
1. Sign up at [twilio.com](https://www.twilio.com)
2. Get a phone number (starts at $1/month)
3. Note your Account SID and Auth Token

### 2. Add to Environment

Edit `/root/openclaw/.env.local`:
```bash
# Twilio (for phone calls)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890  # Your Twilio number

# Your cell phone number
MY_PHONE_NUMBER=+19876543210
```

### 3. Update Config

Edit `/root/openclaw/openclaw.json5`:
```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          provider: "twilio",
          fromNumber: "+1234567890",
          twilio: {
            accountSid: "${TWILIO_ACCOUNT_SID}",
            authToken: "${TWILIO_AUTH_TOKEN}",
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

### 4. Test Phone Call

```bash
# Call yourself
cd /root/openclaw
openclaw voicecall call --to $MY_PHONE_NUMBER --message "Hello! This is your AI assistant calling. How can I help you today?"
```

---

## 📱 Option B: LiveKit Mobile App

### For iOS (Swift)

```swift
import LiveKit

class VoiceViewController: UIViewController {
    var room: Room?
    
    func connect() async {
        let url = "wss://aitoolpool-7b5eca5f.livekit.cloud"
        let token = "..." // Get from your server
        
        room = Room()
        try await room!.connect(url: url, token: token)
        
        // Enable microphone
        try await room!.localParticipant.setMicrophone(enabled: true)
    }
}
```

### For Android (Kotlin)

```kotlin
import io.livekit.android.LiveKit

class VoiceActivity : AppCompatActivity() {
    private lateinit var room: Room
    
    suspend fun connect() {
        val url = "wss://aitoolpool-7b5eca5f.livekit.cloud"
        val token = "..." // Get from your server
        
        room = LiveKit.create(this)
        room.connect(url, token)
        
        // Enable microphone
        room.localParticipant.setMicrophoneEnabled(true)
    }
}
```

### For React Native

```bash
npm install @livekit/react-native
```

```javascript
import { Room, RoomEvent } from '@livekit/react-native';

const room = new Room();
await room.connect('wss://aitoolpool-7b5eca5f.livekit.cloud', token);
await room.localParticipant.setMicrophoneEnabled(true);
```

### Start Agent for Mobile

```bash
cd /root/openclaw/extensions/livekit-agent
npm start mobile-voice-room
```

Then connect your app to room `mobile-voice-room`.

---

## 💬 Option C: Telegram/WhatsApp Triggers

### Setup Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot: `/newbot`
3. Get your bot token
4. Add to `.env.local`:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### Configure OpenClaw for Telegram

Edit `openclaw.json5`:
```json5
{
  channels: {
    telegram: {
      enabled: true,
      config: {
        botToken: "${TELEGRAM_BOT_TOKEN}",
      },
    },
  },
}
```

### Voice Trigger Commands

Once set up, you can message your bot:

**For Phone Calls:**
```
call me
```
The bot will call your phone using Twilio.

**For LiveKit Voice:**
```
voice chat
```
The bot will:
1. Start the LiveKit agent
2. Give you a room URL
3. You join via browser/app

**With Custom Message:**
```
call me and tell me about my schedule
```

---

## 🎛️ Advanced: Combined Setup

Use **both** Twilio and LiveKit for maximum flexibility:

```json5
{
  plugins: {
    entries: {
      "voice-call": {
        enabled: true,
        config: {
          // Default to Twilio for phone calls
          provider: "twilio",
          fromNumber: "+1234567890",
          twilio: {
            accountSid: "${TWILIO_ACCOUNT_SID}",
            authToken: "${TWILIO_AUTH_TOKEN}",
          },
          
          // But also enable LiveKit config for app-based voice
          livekit: {
            wsUrl: "${LIVEKIT_URL}",
            apiKey: "${LIVEKIT_API_KEY}",
            apiSecret: "${LIVEKIT_API_SECRET}",
          },
          
          // Deepgram for STT/TTS
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
          
          // Cerebras for fast responses
          responseModel: "cerebras/llama3.1-8b",
          responseTimeoutMs: 10000,
        },
      },
    },
  },
}
```

---

## 🚀 Quick Start Commands

### Phone Call
```bash
# Call yourself
openclaw voicecall call --to +19876543210 --message "Hello!"

# With conversation mode (stays on line)
openclaw voicecall call --to +19876543210 --message "Hey" --mode conversation

# Check call status
openclaw voicecall status --call-id <id>
```

### LiveKit Voice
```bash
# Start agent for mobile/web
openclaw voicecall agent my-room-name

# Or directly
cd extensions/livekit-agent && npm start my-room-name
```

### Telegram/WhatsApp
```bash
# Start gateway (for Telegram/WhatsApp)
openclaw gateway

# In another terminal, start the bot
openclaw channels telegram start
```

---

## 💡 Recommended Setup for You

Based on your goal, I recommend:

1. **Add Twilio** for phone calls (most convenient)
2. **Keep LiveKit** for when you want HD quality via app
3. **Add Telegram/WhatsApp** for easy triggering

**Next Steps:**
1. Sign up for Twilio ($1/month + usage)
2. Add credentials to `.env.local`
3. Update `openclaw.json5` config
4. Test with: `openclaw voicecall call --to YOUR_NUMBER --message "Test"`

**Cost Estimate:**
- Twilio phone number: $1/month
- Calls: ~$0.01-0.02/minute
- Deepgram STT/TTS: ~$0.004/minute
- Cerebras LLM: ~$0.001/minute
- **Total: ~$0.02-0.03/minute** (very affordable!)

---

## 📚 Documentation

- [Twilio Console](https://console.twilio.com)
- [LiveKit Mobile SDKs](https://docs.livekit.io/client-sdk-js/)
- [OpenClaw Voice Call Plugin](/docs/plugins/voice-call.md)
- [Deepgram Pricing](https://deepgram.com/pricing)

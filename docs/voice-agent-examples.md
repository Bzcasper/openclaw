# Voice Agent Integration Examples

Complete examples for using your voice agent via different channels.

## 🚀 Quick Start Commands

### 1. Start LiveKit Voice Agent

```bash
# Terminal 1: Start the agent
cd /root/openclaw/extensions/livekit-agent
npm start my-room-name

# Or via openclaw CLI:
openclaw voicecall agent my-room-name
```

### 2. Join from Browser

```bash
# Generate token and URL
node -e "
const { AccessToken } = require('livekit-server-sdk');
const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
  identity: 'user-123',
  ttl: '1h',
});
token.addGrant({ roomJoin: true, room: 'my-room-name', canPublish: true, canSubscribe: true });
token.toJwt().then(jwt => console.log('Token:', jwt));
"

# Or use the meet URL:
# https://meet.livekit.io/custom?url=wss://aitoolpool-7b5eca5f.livekit.cloud&token=YOUR_TOKEN
```

### 3. Make Phone Call (Twilio)

```bash
# Once Twilio is configured:
openclaw voicecall call \
  --to "+19876543210" \
  --message "Hello! This is your AI assistant." \
  --mode conversation

# Check status:
openclaw voicecall status --call-id <id>

# End call:
openclaw voicecall end --call-id <id>
```

## 💬 Telegram Integration

### Setup

1. Message [@BotFather](https://t.me/botfather)
2. Create bot: `/newbot`
3. Copy token to `.env.local`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
4. Enable in `openclaw.json5`:
   ```json5
   channels: {
     telegram: {
       enabled: true,
       config: { botToken: "${TELEGRAM_BOT_TOKEN}" }
     }
   }
   ```
5. Start bot:
   ```bash
   openclaw channels telegram start
   ```

### Usage

**Call yourself:**
```
You: call me
Bot: 📞 Calling +19876543210...
Bot: ✅ Call initiated! ID: call_abc123
[Your phone rings]
```

**Start voice chat:**
```
You: voice chat
Bot: 🎤 Starting voice session...
Bot: ✅ Voice session ready!
Bot: 📱 Click to join: https://meet.livekit.io/custom?token=xxxxx
Bot: 🎙️ Room: voice-user123-1699123456789
```

**Call someone else:**
```
You: call +15555551234
Bot: 📞 Calling +15555551234...
```

## 🔧 Advanced Usage

### Programmatic API

```typescript
import { LiveKitVoiceAgent } from "./extensions/livekit-agent/src/agent";

const agent = new LiveKitVoiceAgent({
  livekit: {
    wsUrl: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY,
    sttModel: "nova-3",
    ttsVoice: "aura-asteria-en",
  },
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    model: "llama3.1-8b",
  },
  settings: {
    systemPrompt: "You are a helpful voice assistant.",
    silenceDurationMs: 800,
  },
});

// Listen for events
agent.onEvent((event) => {
  console.log("Event:", event.type);
  if (event.type === "transcript") {
    console.log(`${event.segment.speaker}: ${event.segment.text}`);
  }
});

// Connect to room
await agent.connect("my-room");

// The agent now listens and responds automatically!
```

### Custom Voice Trigger

```typescript
import { VoiceTriggerHandler } from "./extensions/voice-call/src/handlers/voice-trigger";

const handler = new VoiceTriggerHandler();

// In your Telegram/WhatsApp bot:
const handled = await handler.handleMessage({
  userId: message.from.id,
  userPhone: userPhoneNumber,  // Optional
  message: message.text,
  reply: async (text) => {
    await bot.sendMessage(chatId, text);
  },
});

if (handled) {
  console.log("Voice command processed");
}
```

## 📱 Mobile App Integration

### React Native

```javascript
import { Room } from '@livekit/react-native';

async function startVoiceSession() {
  // Get token from your server
  const token = await fetch('/api/get-token', {
    method: 'POST',
    body: JSON.stringify({ room: 'my-room' }),
  }).then(r => r.json());
  
  const room = new Room();
  
  // Connect
  await room.connect('wss://aitoolpool-7b5eca5f.livekit.cloud', token);
  
  // Enable microphone
  await room.localParticipant.setMicrophoneEnabled(true);
  
  // Listen for AI responses
  room.on('trackSubscribed', (track) => {
    if (track.kind === 'audio') {
      // AI is speaking!
    }
  });
}
```

### iOS (Swift)

```swift
import LiveKit

class VoiceViewController: UIViewController {
    var room: Room?
    
    func connect() async {
        let url = "wss://aitoolpool-7b5eca5f.livekit.cloud"
        let token = "..." // Get from server
        
        room = Room()
        try await room!.connect(url: url, token: token)
        try await room!.localParticipant.setMicrophone(enabled: true)
    }
}
```

### Android (Kotlin)

```kotlin
import io.livekit.android.LiveKit

class VoiceActivity : AppCompatActivity() {
    private lateinit var room: Room
    
    suspend fun connect() {
        val url = "wss://aitoolpool-7b5eca5f.livekit.cloud"
        val token = "..." // Get from server
        
        room = LiveKit.create(this)
        room.connect(url, token)
        room.localParticipant.setMicrophoneEnabled(true)
    }
}
```

## 🎯 Use Cases

### Personal AI Assistant
```bash
# Call yourself in the morning
openclaw voicecall call \
  --to "+19876543210" \
  --message "Good morning! Here's your schedule for today..."

# Or via Telegram
# "call me"
```

### Customer Support Bot
```bash
# Agent runs continuously
openclaw voicecall agent support-line

# Customers join via browser/app
# AI answers questions, routes to human if needed
```

### Language Practice Partner
```bash
openclaw voicecall agent spanish-practice

# Configure in openclaw.json5:
responseSystemPrompt: "You are a Spanish tutor. Help the user practice conversational Spanish. Correct their mistakes gently."
```

### Interview Coach
```bash
openclaw voicecall agent interview-prep

# System prompt:
responseSystemPrompt: "You are an interview coach. Ask common interview questions and provide feedback on the user's answers."
```

## 🛠️ Configuration Options

### Change Voice

In `openclaw.json5`:
```json5
tts: {
  provider: "deepgram",
  deepgram: {
    model: "aura-orion-en"  // Male voice
    // Options: aura-asteria-en (female), aura-luna-en, aura-stella-en, 
    //          aura-athena-en, aura-orion-en (male), aura-arcas-en, aura-perseus-en
  }
}
```

### Change STT Model

```json5
streaming: {
  sttModel: "nova-3",  // Best accuracy
  // Alternative: "nova-2", "whisper-large"
}
```

### Change LLM Model

```json5
responseModel: "cerebras/llama3.1-8b",  // Fastest
// Alternative: "cerebras/llama-3.3-70b" (more capable but slightly slower)
```

### Custom Personality

```json5
responseSystemPrompt: `You are a witty, enthusiastic AI assistant.
Rules:
1. Use humor when appropriate
2. Be concise but energetic
3. Show enthusiasm about helping
4. Use casual language, like talking to a friend`
```

## 🔍 Debugging

### Test Components
```bash
# Test all voice components
cd /root/openclaw
pnpm tsx scripts/test-voice-setup.ts

# Test agent specifically
cd extensions/livekit-agent
npx tsx scripts/test-agent.ts
```

### Check Logs
```bash
# Agent logs
tail -f /root/openclaw/extensions/livekit-agent/agent.log

# Gateway logs
openclaw logs

# Voice-call logs
tail -f ~/.openclaw/voice-calls/calls.jsonl
```

### Monitor Connection
```bash
# Watch room participants
openclaw voicecall status --call-id <room-name>
```

## 📚 Related Files

- `extensions/livekit-agent/` - Voice agent implementation
- `extensions/voice-call/` - Phone/WebRTC integration
- `docs/YOUR_VOICE_AGENT_GUIDE.md` - Complete setup guide
- `skills/voice-call/SKILL.md` - Skill documentation

## 💡 Tips

1. **Use headphones** for best experience (prevents echo)
2. **Speak clearly** - STT works best with clear speech
3. **Pause naturally** - The agent detects speech end automatically
4. **Keep responses short** - Configure system prompt for brevity
5. **Test in quiet environment** - Background noise affects STT accuracy

## 🆘 Troubleshooting

**"Agent won't connect"**
- Check LIVEKIT_URL, API_KEY, API_SECRET in .env.local
- Verify network connectivity
- Run: `npx tsx extensions/livekit-agent/scripts/test-agent.ts`

**"No audio output"**
- Check browser/app microphone permissions
- Verify audio track was published (see logs)
- Try headphones to rule out speaker issues

**"STT not working"**
- Check DEEPGRAM_API_KEY
- Verify silenceDurationMs setting (try 1000-1200ms)
- Check STT logs for errors

**"Phone calls fail"**
- Verify Twilio credentials
- Check fromNumber is valid Twilio number
- Ensure toNumber is E.164 format (+1234567890)

## 🎉 Success!

Your voice agent is now fully integrated and ready to use via:
- ✅ Phone calls (Twilio)
- ✅ WebRTC (LiveKit)
- ✅ Telegram bot commands
- ✅ WhatsApp (if configured)
- ✅ Mobile apps (React Native/Swift/Kotlin)
- ✅ Browser (meet.livekit.io)

**Start using it:**
```bash
# LiveKit voice
openclaw voicecall agent my-first-room

# Phone call (once Twilio configured)
openclaw voicecall call --to +YOUR_NUMBER --message "Hello!"

# Telegram
# Message your bot: "voice chat"
```

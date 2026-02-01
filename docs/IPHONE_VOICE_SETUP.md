# iPhone Voice Setup - Like Siri for Your AI Agent

## 🎯 What You Can Do

Set up your iPhone to activate your AI voice agent using:
1. **Voice Wake** (like "Hey Siri") - Built into OpenClaw iOS app
2. **Shortcut Automation** - iOS Shortcuts with voice trigger
3. **LiveKit Mobile App** - Full WebRTC voice in a custom app

## 📱 Option 1: OpenClaw iOS App (Voice Wake)

### What It Does
- Always-listening voice wake (like "Hey Siri")
- Say trigger words like "OpenClaw" or "Computer"
- Automatically connects to your agent
- Uses iOS native speech recognition

### Prerequisites
- iOS device (iPhone/iPad)
- Gateway running on another device (Mac/Linux/Windows)
- OpenClaw iOS app (internal preview - see below)

### Setup Steps

#### 1. Start the Gateway
```bash
# On your Mac, Linux, or Windows machine
openclaw gateway --port 18789
```

#### 2. Build/Install iOS App

The iOS app is in `/root/openclaw/apps/ios/` but requires:
- macOS with Xcode
- Apple Developer account
- Build from source

**Build command:**
```bash
cd /root/openclaw/apps/ios
xcodebuild -project OpenClaw.xcodeproj -scheme OpenClaw -destination 'platform=iOS'
```

**Or use TestFlight (if available):**
- Contact OpenClaw team for TestFlight access
- Install via TestFlight app

#### 3. Pair Your iPhone

1. Open iOS app → Settings
2. The app will discover your Gateway via Bonjour (same WiFi)
3. Or enable Manual Host and enter: `your-gateway-ip:18789`
4. Approve pairing on Gateway:
```bash
openclaw nodes pending
openclaw nodes approve <requestId>
```

#### 4. Enable Voice Wake

In iOS app Settings:
1. Toggle **Voice Wake** ON
2. Set trigger words (default: "openclaw", "claude", "computer")
3. Grant Microphone permission
4. Grant Speech Recognition permission

#### 5. Set Up Voice Agent Integration

You have two paths:

**Path A: Use Gateway's Built-in Voice (Simplest)**
The Gateway can forward voice commands to your agent automatically. Configure in `openclaw.json5`:
```json5
{
  agents: {
    defaults: {
      model: {
        primary: "cerebras/llama3.1-8b"
      }
    }
  },
  // Voice wake forwards to this agent
  voicewake: {
    triggers: ["openclaw", "claude", "computer"],
    forwardTo: "voice-agent"
  }
}
```

**Path B: Trigger LiveKit Agent (Best Quality)**
When voice wake detects your command, trigger the LiveKit agent:

Create a hook script (`~/.openclaw/hooks/voicewake.sh`):
```bash
#!/bin/bash
# Triggered when voice wake detects command

# Start LiveKit agent if not running
if ! pgrep -f "livekit-agent.*voice-ios-room"; then
  cd /root/openclaw/extensions/livekit-agent
  nohup npm start voice-ios-room > /tmp/voice-ios.log 2>&1 &
fi

# Return room info to iOS
# The iOS app should then open a WebView to join the room
```

### How It Works

```
You say: "Hey OpenClaw, what's my schedule?"
    ↓
iOS App (Voice Wake detects)
    ↓
Sends transcript to Gateway via WebSocket
    ↓
Gateway forwards to AI (Cerebras LLM)
    ↓
AI responds
    ↓
Response sent back to iOS app (TTS or text)
    ↓
You hear the response
```

**Latency:** ~500-800ms (includes iOS speech recognition)

---

## 📱 Option 2: iOS Shortcuts (No App Build Needed)

### What It Does
- Use built-in iOS Shortcuts app
- Set custom voice phrase
- Triggers LiveKit voice session
- Opens Safari to join room

### Setup Steps

#### 1. Create Shortcut

1. Open **Shortcuts** app on iPhone
2. Tap **+** to create new shortcut
3. Tap **Add Action**
4. Search for **"Get Contents of URL"**

#### 2. Configure Webhook

Set up URL:
```
http://your-server:3334/voice/trigger?mode=livekit&user=iphone
```

Or use SSH command if you have SSH access:
```bash
ssh user@your-server "cd /root/openclaw/extensions/livekit-agent && npm start shortcut-room"
```

#### 3. Set Voice Trigger

1. Tap shortcut settings (⚙️)
2. Turn ON **"Use as Quick Action"**
3. Set **"Ask Before Running"** to OFF
4. Go to **Automation** tab
5. Create **Personal Automation**
6. Choose **"Voice"** trigger
7. Set phrase: "Start AI voice"
8. Action: Run your shortcut

#### 4. Shortcut Actions

Your shortcut should:
1. Call webhook to start agent
2. Get room URL from response
3. Open URL in Safari

**Example Shortcut:**
```
1. Get Contents of URL
   URL: http://your-server:3334/api/voice/start
   Method: POST
   Headers: Authorization: Bearer YOUR_TOKEN
   
2. Get Dictionary from Input
   (Extracts roomUrl from JSON)

3. Open URLs
   URL: roomUrl from previous step
```

### Result

You say: "Start AI voice"
    ↓
iOS Shortcut runs
    ↓
Webhook starts LiveKit agent
    ↓
Safari opens to room
    ↓
Tap "Join" and talk!

---

## 📱 Option 3: Custom LiveKit iOS App (Best Experience)

### What It Does
- Native iOS app with LiveKit SDK
- One tap to start voice session
- Background voice wake
- Best audio quality

### Setup

#### 1. Create New iOS Project

**Xcode → New Project → iOS App**

#### 2. Add LiveKit Dependency

**Swift Package Manager:**
```swift
// Package.swift or Xcode SPM
dependencies: [
    .package(url: "https://github.com/livekit/client-sdk-swift.git", from: "2.0.0")
]
```

**Or CocoaPods:**
```ruby
# Podfile
pod 'LiveKit'
```

#### 3. Build Voice Agent App

**ViewController.swift:**
```swift
import UIKit
import LiveKit

class VoiceViewController: UIViewController {
    @IBOutlet weak var statusLabel: UILabel!
    @IBOutlet weak var connectButton: UIButton!
    @IBOutlet weak var transcriptLabel: UILabel!
    
    var room: Room?
    let livekitUrl = "wss://aitoolpool-7b5eca5f.livekit.cloud"
    
    override func viewDidLoad() {
        super.viewDidLoad()
        statusLabel.text = "Ready to connect"
    }
    
    @IBAction func connectTapped(_ sender: UIButton) {
        // Generate token (should come from your server)
        let token = generateToken(roomName: "ios-voice-room")
        
        connectToRoom(token: token)
    }
    
    func connectToRoom(token: String) {
        room = Room()
        
        room?.connect(livekitUrl, token: token)
            .then { [weak self] in
                self?.statusLabel.text = "Connected! Speak now..."
                self?.connectButton.setTitle("Connected", for: .normal)
                
                // Enable microphone
                self?.room?.localParticipant?.setMicrophone(enabled: true)
            }
            .catch { [weak self] error in
                self?.statusLabel.text = "Error: \(error.localizedDescription)"
            }
    }
    
    func generateToken(roomName: String) -> String {
        // In production, get this from your server
        // For demo, generate locally (not secure!)
        // Use the AccessToken class from livekit-server-sdk
        return "your-jwt-token-here"
    }
}
```

#### 4. Add Voice Wake (Optional)

Use iOS `SFSpeechRecognizer` for custom wake word:

```swift
import Speech

class VoiceWakeManager: NSObject, SFSpeechRecognizerDelegate {
    let speechRecognizer = SFSpeechRecognizer()
    var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    var recognitionTask: SFSpeechRecognitionTask?
    let audioEngine = AVAudioEngine()
    
    func startListening() {
        // Request authorization
        SFSpeechRecognizer.requestAuthorization { status in
            // Handle authorization
        }
        
        // Start recognition
        do {
            try startRecording()
        } catch {
            print("Couldn't start recording: \(error)")
        }
    }
    
    func startRecording() throws {
        // Setup audio session
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        
        let inputNode = audioEngine.inputNode
        
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest!) { result, error in
            if let result = result {
                let transcript = result.bestTranscription.formattedString
                
                // Check for wake words
                if transcript.lowercased().contains("hey ai") {
                    // Trigger connection
                    self.stopRecording()
                    // Call your connect function
                }
            }
        }
        
        // Start audio engine
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }
        
        audioEngine.prepare()
        try audioEngine.start()
    }
    
    func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
    }
}
```

#### 5. Server-Side Token Generation

Create a simple server to generate LiveKit tokens:

**server.js:**
```javascript
const express = require('express');
const { AccessToken } = require('livekit-server-sdk');

const app = express();

app.post('/get-token', (req, res) => {
  const roomName = req.body.room || 'ios-room';
  const userId = req.body.userId || 'ios-user';
  
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: userId,
      ttl: '1h',
    }
  );
  
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });
  
  res.json({ token: token.toJwt() });
});

app.listen(3000);
```

---

## 🎙️ Voice Wake Trigger Words

### Default Triggers (OpenClaw)
- "OpenClaw"
- "Claude" 
- "Computer"

### Custom Triggers
Edit `~/.openclaw/settings/voicewake.json`:
```json
{
  "triggers": ["hey brain", "ok ai", "wake up"],
  "updatedAtMs": 1699123456789
}
```

Or via CLI:
```bash
openclaw config set voicewake.triggers '["hey brain", "ok ai"]'
```

---

## 🔧 Complete Integration Example

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         iPHONE                                │
│  ┌─────────────────┐    ┌─────────────────────────────────┐  │
│  │ Voice Wake      │    │ LiveKit App (or Safari)         │  │
│  │ (Always On)     │    │ ┌─────────────────────────────┐ │  │
│  │ "Hey OpenClaw"  │───▶│ │ WebRTC Audio Stream         │ │  │
│  └─────────────────┘    │ │ ↕ Real-time duplex          │ │  │
│         │               │ └─────────────────────────────┘ │  │
│         │ Trigger       └─────────────────────────────────┘  │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ iOS Shortcut    │                                         │
│  │ (Alternative)   │                                         │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket / HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      GATEWAY (Mac/Linux)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ OpenClaw Gateway                                         │ │
│  │ - Receives voice commands from iOS                      │ │
│  │ - Forwards to AI (Cerebras)                             │ │
│  │ - Returns responses                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    LIVEKIT AGENT                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │ Deepgram    │  │  Cerebras   │  │   Deepgram          │   │
│  │ STT         │──│   LLM       │──│   TTS               │   │
│  │ (Streaming) │  │  (250ms)    │  │   (Aura voice)      │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Recommended Setup

**For quick setup:** Use Option 2 (iOS Shortcuts)
- No app building required
- Works with existing iOS features
- Can trigger LiveKit agent

**For best experience:** Use Option 3 (Custom LiveKit iOS App)
- Native app feel
- Best audio quality
- Can add voice wake
- Professional result

**For OpenClaw ecosystem:** Use Option 1 (OpenClaw iOS App)
- Integrated with Gateway
- Works with all OpenClaw features
- Voice wake included
- Requires app build

---

## 🚀 Quick Start (Choose One)

### Fastest: iOS Shortcuts (5 minutes)
1. Open Shortcuts app
2. Create shortcut that calls your server webhook
3. Set voice trigger phrase
4. Webhook starts LiveKit agent
5. Opens room in Safari

### Best Quality: Custom LiveKit App (2-3 hours)
1. Create iOS project in Xcode
2. Add LiveKit SDK
3. Build simple UI (Connect button + status)
4. Add token generation endpoint on server
5. Deploy to your iPhone

### Most Integrated: OpenClaw iOS (30 minutes + build time)
1. Build OpenClaw iOS app from source
2. Install on iPhone
3. Pair with Gateway
4. Enable Voice Wake
5. Configure to trigger LiveKit agent

---

## 📚 Related Files

- `docs/platforms/ios.md` - iOS node documentation
- `docs/nodes/voicewake.md` - Voice wake configuration
- `docs/platforms/mac/voicewake.md` - macOS voice wake details
- `apps/ios/` - iOS app source code
- `extensions/livekit-agent/` - Voice agent implementation

## 💡 Tips

1. **Use headphones** for best experience (prevents echo)
2. **Quiet environment** improves recognition accuracy
3. **Speak clearly** - iOS speech recognition works best with clear speech
4. **Background limitations** - iOS may suspend background audio; keep app active
5. **Network quality** - Use WiFi for best WebRTC performance

## 🆘 Troubleshooting

**"Voice wake not detecting"**
- Check microphone permission
- Verify speech recognition enabled in Settings → Privacy
- Try different trigger words
- Speak clearly with slight pause after trigger word

**"Can't connect to room"**
- Verify Gateway is running
- Check iPhone and Gateway on same network (or Tailscale)
- Check firewall ports (18789 for Gateway)
- Verify LiveKit credentials

**"No audio in room"**
- Grant microphone permission in Safari/app
- Check mute switch on iPhone
- Try headphones
- Check LiveKit agent logs

**"iOS app not building"**
- Need macOS with Xcode
- Apple Developer account required
- Check Swift version compatibility
- Verify all dependencies installed

---

## ✅ Summary

You have **three options** to activate your AI voice agent on iPhone:

1. **iOS Shortcuts** - Fastest, no coding
2. **Custom LiveKit App** - Best quality, requires Xcode
3. **OpenClaw iOS App** - Most integrated, requires build

**All options work with your LiveKit voice agent!**

Start with **Option 2 (Shortcuts)** for quick testing, then move to **Option 3 (Custom App)** for the best experience.

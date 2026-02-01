#!/usr/bin/env node
/**
 * LiveKit Agent Launcher
 * 
 * This script launches the LiveKit voice agent from the main openclaw project.
 * It ensures the agent is built and properly configured before starting.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const agentDir = join(__dirname, "..");
const distIndex = join(agentDir, "dist", "index.js");

// Check if agent is built
if (!existsSync(distIndex)) {
  console.error("❌ LiveKit agent not built. Building now...");
  
  const build = spawn("npm", ["run", "build"], {
    cwd: agentDir,
    stdio: "inherit",
    shell: true,
  });

  build.on("close", (code) => {
    if (code !== 0) {
      console.error("❌ Build failed");
      process.exit(1);
    }
    runAgent();
  });
} else {
  runAgent();
}

function runAgent() {
  const roomName = process.argv[2];
  
  if (!roomName) {
    console.error("Usage: livekit-agent <room-name>");
    console.error("   or: AGENT_ROOM_NAME=<room> livekit-agent");
    process.exit(1);
  }

  console.log(`🎤 Starting LiveKit agent for room: ${roomName}`);
  
  const agent = spawn("node", [distIndex, roomName], {
    cwd: agentDir,
    stdio: "inherit",
  });

  agent.on("close", (code) => {
    process.exit(code || 0);
  });

  agent.on("error", (err) => {
    console.error("Failed to start agent:", err);
    process.exit(1);
  });
}

import { spawn, execSync, ChildProcess } from "child_process";

const PORT = 5055;
const consumerOrigin = `http://127.0.0.1:${PORT}`;

// Start a lightweight static file server in a separate child process
const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');
http.createServer((req, res) => {
  const file = path.join(process.cwd(), 'consumer', 'index.html');
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(${PORT}, '127.0.0.1', () => console.log('READY'));
`;

const serverProc = spawn("node", ["-e", serverScript], {
  stdio: ["pipe", "pipe", "pipe"],
});

function stopServer() {
  try {
    if (serverProc.pid) {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${serverProc.pid}`, { stdio: "ignore" });
      } else {
        serverProc.kill("SIGTERM");
      }
    }
  } catch {}
}

async function run() {
  // Wait for server to output READY
  await new Promise<void>((resolve, reject) => {
    serverProc.stdout.on("data", (data) => {
      if (data.toString().includes("READY")) resolve();
    });
    serverProc.on("error", reject);
    setTimeout(() => reject(new Error("Timeout starting consumer server")), 5000);
  });

  console.log(`Consumer running at distinct origin: ${consumerOrigin}`);

  try {
    // 1. Verify consumer file is served correctly
    const consumerRes = execSync(`curl.exe -s -i "${consumerOrigin}"`).toString();
    const hasApiBase = consumerRes.includes("https://momentum-api-ruby.vercel.app");
    console.log(`Consumer served successfully: ${hasApiBase ? "YES (API_BASE verified)" : "NO"}`);

    // 2. Simulate browser cross-origin request from consumer origin to live API
    console.log("\nSimulating browser cross-origin fetch to live API with Origin header...");
    const apiUrl = "https://momentum-api-ruby.vercel.app/api/v1/listings?limit=2";
    const liveApiResponse = execSync(
      `curl.exe -s -i -H "Origin: ${consumerOrigin}" "${apiUrl}"`
    ).toString();

    console.log("\n--- Live API Response with Consumer Origin ---");
    console.log(liveApiResponse);

    // 3. Verify CORS headers present
    const hasAllowOrigin = liveApiResponse.toLowerCase().includes("access-control-allow-origin");
    const is200 = liveApiResponse.includes("200 OK");
    console.log(`CORS Header 'Access-Control-Allow-Origin' Present: ${hasAllowOrigin ? "YES" : "NO"}`);
    console.log(`Response HTTP Status 200: ${is200 ? "YES" : "NO"}`);

    if (hasAllowOrigin && is200 && hasApiBase) {
      console.log("\nVerdict: Consumer and CORS integration verified against live production API!");
    } else {
      console.error("\nVerdict: Verification failed!");
      process.exit(1);
    }
  } finally {
    stopServer();
  }
}

run().catch((err) => {
  stopServer();
  console.error("Test failed:", err?.message || err);
  process.exit(1);
});

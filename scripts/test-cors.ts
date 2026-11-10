import fs from "fs";
import http from "http";
import { spawn, execSync, ChildProcess } from "child_process";

// 1. Safely load local .env
if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// 2. Parse DATABASE_URL and exit unless hostname is localhost or 127.0.0.1
const rawDbUrl = process.env.DATABASE_URL;
if (!rawDbUrl) {
  console.error("[Error] DATABASE_URL is not set.");
  process.exit(1);
}

try {
  const parsedDbUrl = new URL(rawDbUrl);
  if (parsedDbUrl.hostname !== "localhost" && parsedDbUrl.hostname !== "127.0.0.1") {
    console.error(
      `[Error] Safety check failed: DATABASE_URL hostname is '${parsedDbUrl.hostname}'. Tests must run strictly against localhost or 127.0.0.1.`
    );
    process.exit(1);
  }
} catch {
  console.error("[Error] DATABASE_URL could not be parsed as a valid URL.");
  process.exit(1);
}

async function waitForServer(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/v1/listings?limit=1`, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server at port ${port} failed to become healthy within ${timeoutMs}ms`);
}

function stopServer(proc: ChildProcess): void {
  try {
    if (proc.pid) {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" });
      } else {
        proc.kill("SIGTERM");
      }
    }
  } catch {
    // Process already exited
  }
}

async function main() {
  const port = 3088;
  console.log(`Starting server on port ${port}...`);
  const server = spawn("npx.cmd", ["next", "start", "-p", String(port)], {
    stdio: "ignore",
    shell: true,
    env: process.env,
  });

  try {
    await waitForServer(port);
    console.log("Server is ready. Running Part 3 CORS curl tests...\n");

    console.log("================================================================================");
    console.log("1. GET /api/v1/listings?limit=1 (Expect 200 with CORS headers)");
    console.log("================================================================================");
    const out200 = execSync(
      `curl.exe -s -i -H "Origin: https://example.com" "http://127.0.0.1:${port}/api/v1/listings?limit=1"`
    ).toString();
    console.log(out200);

    console.log("================================================================================");
    console.log("2. GET /api/v1/listings/cmw0000000000000000000000 (Expect 404 with CORS headers)");
    console.log("================================================================================");
    const out404 = execSync(
      `curl.exe -s -i -H "Origin: https://example.com" "http://127.0.0.1:${port}/api/v1/listings/cmw0000000000000000000000"`
    ).toString();
    console.log(out404);

    console.log("================================================================================");
    console.log("3. GET /api/v1/listings?offset=-1 (Expect 400 with CORS headers)");
    console.log("================================================================================");
    const out400 = execSync(
      `curl.exe -s -i -H "Origin: https://example.com" "http://127.0.0.1:${port}/api/v1/listings?offset=-1"`
    ).toString();
    console.log(out400);

    console.log("================================================================================");
    console.log("4. OPTIONS /api/v1/listings (Expect 204 with Access-Control-Allow-Methods)");
    console.log("================================================================================");
    const outOptions = execSync(
      `curl.exe -s -i -X OPTIONS -H "Origin: https://example.com" "http://127.0.0.1:${port}/api/v1/listings"`
    ).toString();
    console.log(outOptions);

    console.log("================================================================================");
    console.log("5. POST /api/v1/listings (Expect 401 with NO CORS headers)");
    console.log("================================================================================");
    const outPost = execSync(
      `curl.exe -s -i -X POST -H "Origin: https://example.com" -H "Content-Type: application/json" -d "{}" "http://127.0.0.1:${port}/api/v1/listings"`
    ).toString();
    console.log(outPost);

    console.log("================================================================================");
    console.log("6. Rapid requests to trigger 429 Rate Limit on GET (Expect 429 with CORS headers)");
    console.log("================================================================================");
    let hit429 = false;
    for (let i = 0; i < 70; i++) {
      const out = execSync(
        `curl.exe -s -i -H "Origin: https://example.com" "http://127.0.0.1:${port}/api/v1/listings?limit=1"`
      ).toString();
      if (out.includes("429 Too Many Requests") || out.includes("RATE_LIMIT_EXCEEDED")) {
        console.log(out);
        hit429 = true;
        break;
      }
    }
    if (!hit429) {
      console.log("Note: Rate limit not triggered within 70 iterations in local window.");
    }
  } finally {
    console.log("Stopping server...");
    stopServer(server);
  }
}

main().catch((err) => {
  console.error("CORS test failed:", err);
  process.exit(1);
});

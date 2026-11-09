import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn, execSync, ChildProcess } from "child_process";

// 1. Safely load local .env if variables are not already present in environment
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

const rawApiKey = process.env.API_WRITE_KEY;
if (!rawApiKey) {
  console.error("[Error] API_WRITE_KEY is not set in environment or .env. Failing test run.");
  process.exit(1);
}
const apiKey: string = rawApiKey;

// Redaction helper: never leak or print the write key in output or error messages
function redact(str: string): string {
  if (!apiKey) return str;
  return str.replaceAll(apiKey, "[redacted]");
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

interface TestResult {
  category: string;
  method: string;
  endpoint: string;
  keyHeader: string;
  expectedStatus: number;
  actualStatus: number;
  expectedCode?: string;
  actualCode?: string;
  passed: boolean;
  notes?: string;
}

const results: TestResult[] = [];

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

async function requestJson(
  url: string,
  method: string,
  headers?: Record<string, string>,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  let reqBody: string | undefined;
  if (body !== undefined) {
    reqHeaders["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: reqBody,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

async function run() {
  console.log("=== Step 1: Pre-flight Safety Checks Passed ===");
  console.log("  - DATABASE_URL confirmed targeting local database (localhost / 127.0.0.1)");
  console.log("  - API_WRITE_KEY is present and protected against exposure");

  // 3. Run next build before next start
  console.log("\n=== Step 2: Running Next.js Build ===");
  execSync("npx next build", {
    stdio: "inherit",
    env: process.env,
  });

  const port1 = 3088;
  console.log(`\n=== Step 3: Starting Server 1 (Port ${port1}) with API_WRITE_KEY Configured ===`);
  const server1 = spawn("npx.cmd", ["next", "start", "-p", String(port1)], {
    stdio: "ignore",
    shell: true,
    env: process.env,
  });

  try {
    await waitForServer(port1);
    console.log("Server 1 is ready. Executing write-gate matrix...\n");

    const baseUrl = `http://127.0.0.1:${port1}`;
    const writeEndpoints = [
      { method: "POST", path: "/api/v1/agents", body: { test: true } },
      { method: "PATCH", path: "/api/v1/agents/nonexistent_id", body: { test: true } },
      { method: "DELETE", path: "/api/v1/agents/nonexistent_id", body: undefined },
      { method: "POST", path: "/api/v1/listings", body: { test: true } },
      { method: "PATCH", path: "/api/v1/listings/nonexistent_id", body: { test: true } },
      { method: "DELETE", path: "/api/v1/listings/nonexistent_id", body: undefined },
      { method: "POST", path: "/api/v1/viewings", body: { test: true } },
      { method: "PATCH", path: "/api/v1/viewings/nonexistent_id", body: { test: true } },
      { method: "DELETE", path: "/api/v1/viewings/nonexistent_id", body: undefined },
    ];

    // 4a. Matrix: No Key (expect 401 UNAUTHORIZED)
    for (const ep of writeEndpoints) {
      const res = await requestJson(`${baseUrl}${ep.path}`, ep.method, undefined, ep.body);
      const code = res.data?.error?.code;
      const passed = res.status === 401 && code === "UNAUTHORIZED";
      results.push({
        category: "No Key Matrix",
        method: ep.method,
        endpoint: ep.path,
        keyHeader: "None",
        expectedStatus: 401,
        actualStatus: res.status,
        expectedCode: "UNAUTHORIZED",
        actualCode: code,
        passed,
      });
    }

    // 4b. Matrix: Wrong Key (expect 401 UNAUTHORIZED)
    for (const ep of writeEndpoints) {
      const res = await requestJson(
        `${baseUrl}${ep.path}`,
        ep.method,
        { "x-api-key": "invalid-dummy-key-value" },
        ep.body
      );
      const code = res.data?.error?.code;
      const passed = res.status === 401 && code === "UNAUTHORIZED";
      results.push({
        category: "Wrong Key Matrix",
        method: ep.method,
        endpoint: ep.path,
        keyHeader: "Invalid Key",
        expectedStatus: 401,
        actualStatus: res.status,
        expectedCode: "UNAUTHORIZED",
        actualCode: code,
        passed,
      });
    }

    // 4c. Pipeline Order Proof: POST with no key and invalid body (expect 401, not 422)
    {
      const res = await requestJson(`${baseUrl}/api/v1/agents`, "POST", undefined, {});
      const code = res.data?.error?.code;
      const passed = res.status === 401 && code === "UNAUTHORIZED";
      results.push({
        category: "Gate Ordering Proof",
        method: "POST",
        endpoint: "/api/v1/agents",
        keyHeader: "None (Invalid Body)",
        expectedStatus: 401,
        actualStatus: res.status,
        expectedCode: "UNAUTHORIZED (not 422)",
        actualCode: code,
        passed,
        notes: "Proves key gate executes before body schema validation",
      });
    }

    // 4d. Public Reads Unaffected: GET /api/v1/listings without key (expect 200)
    {
      const res = await requestJson(`${baseUrl}/api/v1/listings?limit=1`, "GET");
      const passed = res.status === 200 && Array.isArray(res.data?.data);
      results.push({
        category: "Public Read Access",
        method: "GET",
        endpoint: "/api/v1/listings?limit=1",
        keyHeader: "None",
        expectedStatus: 200,
        actualStatus: res.status,
        expectedCode: "N/A",
        actualCode: res.data?.data ? "OK" : "ERROR",
        passed,
        notes: "Public read operations require no authentication",
      });
    }

    // 6. Authorized Lifecycle: POST with correct key, then DELETE with correct key
    let createdAgentId: string | null = null;
    {
      const uniqueSuffix = Date.now();
      const newAgentPayload = {
        name: "Test Verification Agent",
        email: `agent.test.${uniqueSuffix}@momentumproperties.com`,
        phone: "(555) 432-1098",
        agencyName: "Verification Realty Group",
        city: "Austin",
        licenseNumber: `LIC-VRF-${uniqueSuffix}`,
      };

      // Create agent
      const createRes = await requestJson(
        `${baseUrl}/api/v1/agents`,
        "POST",
        { "x-api-key": apiKey },
        newAgentPayload
      );
      createdAgentId = createRes.data?.data?.id ?? null;
      const createPassed = createRes.status === 201 && !!createdAgentId;
      results.push({
        category: "Authorized Write Lifecycle",
        method: "POST",
        endpoint: "/api/v1/agents",
        keyHeader: "Valid Key",
        expectedStatus: 201,
        actualStatus: createRes.status,
        expectedCode: "CREATED",
        actualCode: createPassed ? "CREATED" : (createRes.data?.error?.code ?? "ERROR"),
        passed: createPassed,
        notes: `Created agent ID: ${createdAgentId ?? "none"}`,
      });

      // Cleanup: DELETE agent with key
      if (createdAgentId) {
        const deleteRes = await requestJson(
          `${baseUrl}/api/v1/agents/${createdAgentId}`,
          "DELETE",
          { "x-api-key": apiKey }
        );
        const deletePassed =
          deleteRes.status === 200 && deleteRes.data?.data?.deleted === true;
        results.push({
          category: "Authorized Write Lifecycle",
          method: "DELETE",
          endpoint: `/api/v1/agents/${createdAgentId}`,
          keyHeader: "Valid Key",
          expectedStatus: 200,
          actualStatus: deleteRes.status,
          expectedCode: "OK",
          actualCode: deletePassed ? "DELETED" : (deleteRes.data?.error?.code ?? "ERROR"),
          passed: deletePassed,
          notes: "Resource cleaned up after test verification",
        });
      }
    }
  } finally {
    console.log("Shutting down Server 1...");
    stopServer(server1);
  }

  // 5. Fail-Closed Test: Start Server 2 with API_WRITE_KEY unset
  const port2 = 3089;
  console.log(`\n=== Step 4: Starting Server 2 (Port ${port2}) with API_WRITE_KEY UNSET (Fail-Closed) ===`);
  const envWithoutKey = { ...process.env };
  delete envWithoutKey.API_WRITE_KEY;

  // Temporarily rename .env so Next.js does not reload API_WRITE_KEY from disk
  const tempEnvPath = ".env.temp_unset_test";
  const hadEnvFile = fs.existsSync(".env");
  if (hadEnvFile) {
    fs.renameSync(".env", tempEnvPath);
  }

  let server2: ChildProcess | null = null;
  try {
    server2 = spawn("npx.cmd", ["next", "start", "-p", String(port2)], {
      stdio: "ignore",
      shell: true,
      env: envWithoutKey,
    });

    await waitForServer(port2);
    console.log("Server 2 is ready. Testing fail-closed behavior...\n");
    const baseUrl2 = `http://127.0.0.1:${port2}`;

    // POST /api/v1/agents must return 503 SERVICE_UNAVAILABLE
    {
      const res = await requestJson(`${baseUrl2}/api/v1/agents`, "POST", undefined, {
        name: "Fail Closed Agent",
      });
      const code = res.data?.error?.code;
      const passed = res.status === 503 && code === "SERVICE_UNAVAILABLE";
      results.push({
        category: "Fail-Closed Verification",
        method: "POST",
        endpoint: "/api/v1/agents",
        keyHeader: "Unset on Server",
        expectedStatus: 503,
        actualStatus: res.status,
        expectedCode: "SERVICE_UNAVAILABLE",
        actualCode: code,
        passed,
        notes: "Unconfigured server rejects writes with 503",
      });
    }

    // GET /api/v1/listings must still return 200
    {
      const res = await requestJson(`${baseUrl2}/api/v1/listings?limit=1`, "GET");
      const passed = res.status === 200 && Array.isArray(res.data?.data);
      results.push({
        category: "Fail-Closed Verification",
        method: "GET",
        endpoint: "/api/v1/listings?limit=1",
        keyHeader: "Unset on Server",
        expectedStatus: 200,
        actualStatus: res.status,
        expectedCode: "N/A",
        actualCode: res.data?.data ? "OK" : "ERROR",
        passed,
        notes: "Public read operations remain functional when key is unset",
      });
    }
  } finally {
    console.log("Shutting down Server 2...");
    if (server2) {
      stopServer(server2);
    }
    if (hadEnvFile && fs.existsSync(tempEnvPath)) {
      fs.renameSync(tempEnvPath, ".env");
    }
  }

  // Summary Report
  console.log("\n==========================================================================================");
  console.log("                          WRITE-GATE COMPREHENSIVE TEST RESULTS                           ");
  console.log("==========================================================================================\n");

  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(
      `[${mark}] ${r.category.padEnd(28)} | ${r.method.padEnd(6)} ${r.endpoint.padEnd(36)} | Key: ${r.keyHeader.padEnd(16)} | Status: ${String(r.actualStatus).padEnd(3)} (exp ${r.expectedStatus}) | Code: ${r.actualCode || "N/A"}`
    );
  }

  console.log(`\nFinal Verdict: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}\n`);

  // Write markdown results table to OS temp directory
  const mdRows = [
    "| Category | Method | Endpoint | Key State | Expected | Actual | Envelope Code | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.category} | \`${r.method}\` | \`${r.endpoint}\` | ${r.keyHeader} | ${r.expectedStatus} | ${r.actualStatus} | \`${r.actualCode || "N/A"}\` | ${r.passed ? "PASS" : "FAIL"} |`
    ),
  ].join("\n");

  const tempResultsPath = path.join(os.tmpdir(), "write-gate-results.md");
  fs.writeFileSync(tempResultsPath, mdRows, "utf8");
  console.log(`Results table written to temporary OS path: ${tempResultsPath}`);

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  const safeMsg = redact(err?.message || String(err));
  console.error("Test execution failed:", safeMsg);
  process.exit(1);
});

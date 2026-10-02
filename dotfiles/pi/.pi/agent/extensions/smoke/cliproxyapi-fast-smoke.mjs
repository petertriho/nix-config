import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "pi-fast-wire-smoke-"));
const extensions = join(root, "extensions");
const providerExtension = join(extensions, "pi-cliproxyapi-provider.ts");
const shellExtension = join(extensions, "pi-tui-shell.ts");
const requests = [];
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ models: [
      { slug: "gpt-fast-smoke", context_window: 16000, service_tiers: ["priority"] },
      { slug: "gpt-standard-smoke", context_window: 16000, service_tiers: [] },
    ] }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/responses") {
    res.writeHead(404);
    res.end();
    return;
  }
  let text = "";
  for await (const chunk of req) text += chunk;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Invalid JSON" } }));
    return;
  }
  requests.push({ path: req.url, payload });
  const part = { type: "output_text", text: "smoke ok", annotations: [] };
  const item = { type: "message", id: "msg_smoke", role: "assistant", status: "completed", content: [part] };
  const response = {
    id: "resp_smoke", object: "response", model: requests.at(-1).payload.model,
    status: "completed", output: [item],
    service_tier: requests.at(-1).payload.service_tier ?? "default",
    usage: { input_tokens: 1000000, output_tokens: 1000000, total_tokens: 2000000, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  };
  const events = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
    { type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0, part: { ...part, text: "" } },
    { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "smoke ok" },
    { type: "response.output_text.done", item_id: item.id, output_index: 0, content_index: 0, text: "smoke ok" },
    { type: "response.content_part.done", item_id: item.id, output_index: 0, content_index: 0, part },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response },
  ];
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
});
try {
  // Test Pi's embedded SDK mapping, not the repository's development dependencies.
  mkdirSync(extensions);
  copyFileSync(new URL("../pi-cliproxyapi-provider.ts", import.meta.url), providerExtension);
  copyFileSync(new URL("../pi-tui-shell.ts", import.meta.url), shellExtension);
  assert.throws(() => createRequire(providerExtension).resolve("@earendil-works/pi-ai"), { code: "MODULE_NOT_FOUND" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  mkdirSync(join(root, "tmp"), { recursive: true });
  writeFileSync(join(root, "tmp", "models-dev-cache.json"), JSON.stringify({ timestamp: Date.now(), providers: {
    openai: { models: {
      "gpt-fast-smoke": { cost: { input: 5, output: 30 }, experimental: { modes: { fast: { cost: { input: 10, output: 60 } } } } },
      "gpt-standard-smoke": { cost: { input: 1, output: 2 } },
    } },
  } }));
  writeFileSync(join(root, "models.json"), JSON.stringify({ providers: { openai: {
    baseUrl: `${baseUrl}/v1`, apiKey: "smoke-only", api: "openai-responses",
    models: [{ id: "native-smoke", name: "Native pricing smoke", reasoning: false, input: ["text"],
      contextWindow: 16000, maxTokens: 512, cost: { input: 5, output: 30, cacheRead: 0, cacheWrite: 0 },
      samplingParams: { service_tier: "priority" } }],
  } } }));
  const env = { ...process.env, PI_CODING_AGENT_DIR: root, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_API_KEY: "smoke-only" };
  delete env.CLIPROXYAPI_FAST;
  for (const { fast, model, expected, provider = "cliproxyapi", cost } of [
    { fast: false, model: "gpt-fast-smoke", expected: undefined, cost: 35 },
    { fast: true, model: "gpt-fast-smoke", expected: "priority", cost: 70 },
    { fast: true, model: "gpt-standard-smoke", expected: undefined, cost: 3 },
    { fast: true, model: "native-smoke", expected: "priority", provider: "openai", cost: 70 },
  ]) {
    writeFileSync(join(root, "cliproxyapi.json"), JSON.stringify({ fast, pause: false }));
    const execution = run("pi", [
      "--no-extensions", "-e", providerExtension,
      "--no-skills", "--no-prompt-templates", "--no-tools", "--no-session", "--thinking", "off",
      "--model", `${provider}/${model}`, "--mode", "json", "--print", "Reply with smoke ok.",
    ], { cwd: root, env, timeout: 20000 });
    execution.child.stdin.end();
    const { stdout, stderr } = await execution;
    assert.doesNotMatch(stderr, /Failed to load extension|No models match pattern/);
    assert.match(stdout, /smoke ok/, stderr);
    const request = requests.at(-1);
    assert.equal(request.path, "/v1/responses");
    assert.equal(request.payload.model, model);
    assert.equal(request.payload.service_tier, expected);
    const events = stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    const completed = events.find((event) => event.type === "message_end" && event.message?.role === "assistant").message;
    assert.equal(completed.usage.cost.total, cost);
    console.log(`PASS installed Pi request without node_modules: fast=${fast}, model=${model}, service_tier=${expected ?? "omitted"}, reported cost=$${cost}`);
  }
  assert.equal(requests.length, 4);
  const session = `pi-fast-smoke-${process.pid}`;
  const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
  const tmux = (...args) => execFileSync("tmux", args, { encoding: "utf8" });
  writeFileSync(join(root, "cliproxyapi.json"), JSON.stringify({ fast: false, pause: false }));
  const command = [
    "env -u CLIPROXYAPI_FAST",
    `PI_CODING_AGENT_DIR=${quote(root)}`,
    `CLIPROXYAPI_BASE_URL=${quote(baseUrl)}`,
    "CLIPROXYAPI_API_KEY=smoke-only",
    `pi --no-extensions -e ${quote(providerExtension)}`,
    `-e ${quote(shellExtension)}`,
    "--no-skills --no-prompt-templates --no-tools --no-session --thinking off --model cliproxyapi/gpt-fast-smoke",
  ].join(" ");
  tmux("new-session", "-d", "-s", session, "-x", "100", "-y", "30", "-c", root, command);
  const capture = () => tmux("capture-pane", "-p", "-t", session);
  const waitFor = async (check) => {
    const deadline = Date.now() + 15000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`TUI check timed out:\n${capture()}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const enter = (text) => {
    tmux("send-keys", "-t", session, "-l", text);
    tmux("send-keys", "-t", session, "Enter");
  };
  try {
    await waitFor(() => /cliproxyapi\/gpt-fast-smoke.*think off/.test(capture()));
    enter("/fast");
    await waitFor(() => /cliproxyapi\/gpt-fast-smoke.*think off.*fast/.test(capture()));
    console.log("PASS installed Pi TUI: /fast enables the label beside the thinking level");
    enter("/fast");
    await waitFor(() => {
      const line = capture().split("\n").find((line) => line.includes("cliproxyapi/gpt-fast-smoke"));
      return line && !/think off.*fast/.test(line);
    });
    console.log("PASS installed Pi TUI: /fast disables the label");
  } finally {
    tmux("kill-session", "-t", session);
  }
} finally {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

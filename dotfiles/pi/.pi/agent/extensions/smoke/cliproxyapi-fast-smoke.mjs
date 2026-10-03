import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "pi-fast-wire-smoke-"));
const extensions = join(root, "extensions");
const providerFolder = join(extensions, "pi-cliproxyapi-provider");
const providerExtension = join(providerFolder, "index.ts");
const shellExtension = join(extensions, "pi-tui-shell.ts");
const contextExtension = join(extensions, "pi-context.ts");
let displayFixture = "normal";
let catalogRequests = 0;
const requests = [];
const managementRequests = [];
let quotaMode = "ready";
let quotaResetAt = 0;
let quotaFailurePending = false;
const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/v8/management/")) {
    assert.equal(req.headers.authorization, "Bearer management-smoke-only");
    managementRequests.push(req.url);
    const waiting = quotaMode === "waiting";
    const ready = !waiting || Date.now() >= quotaResetAt;
    let body;
    if (req.url === "/v8/management/credentials") {
      if (displayFixture === "failure") { res.writeHead(503); res.end("private-upstream-body"); return; }
      body = { files: [
        { auth_index: "a", name: "codex-a.json", provider: "codex", email: "smoke-a@example.test", id_token: { chatgpt_account_id: "mock-account-a" }, disabled: false,
          unavailable: waiting, next_retry_after: waiting ? new Date(Date.now() + 3600000).toISOString() : undefined,
          ...(["rich", "failed-probe"].includes(displayFixture) ? { label: "Account A 界 synthetic", cooldowns: [{ scope: "model", model_key: "gpt-ui-cooldown", reason: "transient_error", retry_at: new Date(Date.now()+60000).toISOString(), remaining_seconds: 60 }] } : {}) },
        { auth_index: "b", name: "codex-b.json", provider: "codex", email: "smoke-b@example.test", id_token: { chatgpt_account_id: "mock-account-b" }, disabled: false,
          unavailable: waiting && !ready, next_retry_after: waiting && !ready ? new Date(quotaResetAt).toISOString() : undefined },
        ...(displayFixture === "rich" ? [{ auth_index: "c", name: "disabled.json", provider: "codex", label: "Disabled synthetic", disabled: true, unavailable: false }] : []),
      ] };
      if (displayFixture === "empty") body = { files: [] };
    } else if (req.url.startsWith("/v8/management/credentials/models?")) {
      body = { models: [{ id: "gpt-fast-smoke" }, { id: "gpt-standard-smoke" }] };
    } else if (req.method === "POST" && req.url === "/v8/management/requests/api-call") {
      let text = "";
      for await (const chunk of req) text += chunk;
      let call;
      try {
        call = JSON.parse(text);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid management request JSON" }));
        return;
      }
      assert.equal(call.method, "GET");
      assert.equal(call.url, "https://chatgpt.com/backend-api/wham/usage");
      assert.equal(call.header.Authorization, "Bearer $TOKEN$");
      const blocked = waiting && (call.auth_index === "a" || !ready);
      const resetAt = call.auth_index === "a" ? Date.now() + 3600000 : quotaResetAt || Date.now() + 300000;
      body = { status_code: 200, body: JSON.stringify({ rate_limit: {
        allowed: !blocked, limit_reached: blocked,
        primary_window: { used_percent: blocked ? 100 : 40, limit_window_seconds: 18000, reset_at: Math.ceil(resetAt / 1000) },
        secondary_window: { used_percent: 20, limit_window_seconds: 604800, reset_at: Math.ceil((Date.now() + 86400000) / 1000) },
      }, ...(displayFixture === "rich" ? {
        credits: { has_credits: true },
        code_review_rate_limit: { allowed: false, limit_reached: true, primary_window: { used_percent: 100, reset_at: Math.ceil((Date.now()+60000)/1000), limit_window_seconds: 3600 } },
        additional_rate_limits: Array.from({ length: 14 }, (_, i) => ({ limit_name: `gpt-ui-${i}`, rate_limit: { allowed: true, limit_reached: false,
          primary_window: { used_percent: i === 0 ? 130 : i === 1 ? 80 : i === 2 ? 95 : i, reset_at: Math.ceil((Date.now()+60000)/1000), limit_window_seconds: 7200 } } })),
      } : {}) }) };
      if (displayFixture === "failed-probe" && call.auth_index === "a") body = { status_code: 401, body: "private-upstream-body" };
    }
    if (body !== undefined) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
    catalogRequests++;
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
  requests.push({ path: req.url, payload, session: req.headers.session_id ?? req.headers["x-pi-session-id"] });
  if (quotaFailurePending) {
    quotaFailurePending = false;
    res.writeHead(429, { "content-type": "application/json" });
    // Account A resets in an hour. The pool's account B becomes usable sooner.
    res.end(JSON.stringify({ error: { type: "usage_limit_reached", message: "Usage limit reached", resets_in_seconds: 3600 } }));
    return;
  }
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
  cpSync(new URL("../pi-cliproxyapi-provider", import.meta.url), providerFolder, { recursive: true });
  copyFileSync(new URL("../pi-tui-shell.ts", import.meta.url), shellExtension);
  copyFileSync(new URL("../pi-context.ts", import.meta.url), contextExtension);
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
  const env = { ...process.env, PI_CODING_AGENT_DIR: root, CLIPROXYAPI_BASE_URL: baseUrl, CLIPROXYAPI_API_KEY: "smoke-only", CLIPROXYAPI_MANAGEMENT_KEY: "management-smoke-only" };
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
    "CLIPROXYAPI_MANAGEMENT_KEY=management-smoke-only",
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
    const header = () => capture().split("\n").find((line) => line.includes("gpt-fast-smoke") && line.includes("think off")) ?? "";
    enter("/quota-resume on");
    await waitFor(() => header().includes("quota resume"));
    enter("/quota");
    await waitFor(() => capture().includes("smoke-a@example.test") && capture().includes("smoke-b@example.test"));
    await waitFor(() => capture().includes("40% used") && capture().includes("CODEX QUOTA"));
    const quotaFrame = capture().split("\n");
    const accountDivider = quotaFrame.findIndex((line) => /│\s*─+\s*│/.test(line));
    assert.ok(accountDivider > 0, "the roomy popup must show an account divider");
    for (const offset of [-1, 1]) {
      assert.equal(quotaFrame[accountDivider + offset].replace(/│/g, "").trim(), "", "roomy account boundaries need breathing room");
    }
    assert.match(capture(), /reset in (?:\d+\.\d[dhm]|\d+s)/, "reset countdowns use compact units");
    tmux("send-keys", "-t", session, "Enter");
    await waitFor(() => capture().includes("Reset at"));
    const beforeRefresh = managementRequests.filter((url) => url === "/v8/management/credentials").length;
    tmux("send-keys", "-t", session, "-l", "r");
    await waitFor(() => managementRequests.filter((url) => url === "/v8/management/credentials").length === beforeRefresh + 1 && !capture().includes("Refreshing"));
    tmux("send-keys", "-t", session, "-l", "?");
    await waitFor(() => capture().includes("LOCAL SHORTCUTS"));
    tmux("send-keys", "-t", session, "-l", "?");
    await waitFor(() => capture().includes("Reset at"));
    tmux("send-keys", "-t", session, "-l", "q");
    await waitFor(() => !capture().includes("CODEX QUOTA") && header().includes("quota resume"));
    tmux("send-keys", "-t", session, "-l", "editor-focus-ok");
    await waitFor(() => capture().includes("editor-focus-ok"));
    tmux("send-keys", "-t", session, "C-u");
    await waitFor(() => !capture().includes("editor-focus-ok"));
    console.log("PASS installed Pi TUI: stacked used bars, expansion, refresh, help, q completion and restored editor focus; resume header unchanged");

    quotaMode = "waiting";
    quotaResetAt = Date.now() + 5000;
    quotaFailurePending = true;
    const beforeResume = requests.length;
    const startedAt = Date.now();
    enter("Reply with smoke ok for the quota-resume test.");
    await waitFor(() => header().includes("quota wait"));
    enter("/pause");
    await waitFor(() => JSON.parse(readFileSync(join(root, "cliproxyapi.json"), "utf8")).pause === true);
    for (const closeKey of ["q", "Escape"]) {
      enter("/quota"); await waitFor(() => capture().includes("CODEX QUOTA") && capture().includes("100% used"));
      const beforeInspectionRefresh = managementRequests.filter((url) => url === "/v8/management/credentials").length;
      tmux("send-keys", "-t", session, "-l", "r");
      await waitFor(() => managementRequests.filter((url) => url === "/v8/management/credentials").length === beforeInspectionRefresh + 1 && !capture().includes("Refreshing"));
      tmux("send-keys", "-t", session, closeKey);
      await waitFor(() => !capture().includes("CODEX QUOTA"));
      assert.ok(header().includes("quota wait"), "closing inspection must preserve the live assistant quota wait");
      const preferences = JSON.parse(readFileSync(join(root, "cliproxyapi.json"), "utf8"));
      assert.equal(preferences.pause, true); assert.equal(preferences.quotaResume, true);
      assert.equal(requests.length, beforeResume + 1);
    }
    console.log("PASS installed Pi active assistant: popup open/refresh/q/Escape preserve quota wait, manual pause and resume preference without inference");
    enter("/continue");
    await waitFor(() => requests.length === beforeResume + 2 && !header().includes("quota wait"));
    assert.ok(Date.now() - startedAt < 12000, "must use account B's reset rather than account A's one-hour reset");
    const [failed, resumed] = requests.slice(beforeResume);
    assert.deepEqual(resumed.payload.input, failed.payload.input, "retry must preserve the exact conversation, not inject continue");
    assert.equal(resumed.payload.prompt_cache_key, failed.payload.prompt_cache_key);
    assert.ok(resumed.payload.prompt_cache_key || resumed.session, "the test must exercise an actual sticky-session identity");
    assert.equal(resumed.session, failed.session);
    assert.equal(resumed.payload.model, failed.payload.model);
    assert.ok(managementRequests.some((url) => url.startsWith("/v8/management/credentials/models?")));
    console.log("PASS installed Pi TUI: quota wait resumes after the earliest eligible account reset with identical context and session identity");

    quotaResetAt = Date.now() + 60000;
    quotaFailurePending = true;
    const beforeCancel = requests.length;
    enter("Reply with smoke ok for the quota-cancel test.");
    await waitFor(() => header().includes("quota wait"));
    enter("/quota-resume off");
    await waitFor(() => !header().includes("quota wait") && !header().includes("quota resume"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(requests.length, beforeCancel + 1, "turning off quota resume must cancel rather than replay the request");
    console.log("PASS installed Pi TUI: /quota-resume off cancels the pending wait without another model request");
  } finally {
    tmux("kill-session", "-t", session);
  }

  // Native terminal review uses only synthetic management responses and no inference calls.
  quotaMode = "ready";
  const beforeMatrix = requests.length;
  mkdirSync(join(root, "themes"));
  const reviewTheme = join(root, "themes", "live-review.json");
  const themeFixture = (name) => ({ ...JSON.parse(readFileSync(new URL(`../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/${name}.json`, import.meta.url), "utf8")), name: "live-review" });
  writeFileSync(reviewTheme, JSON.stringify(themeFixture("light")));
  for (const [width, height, theme, mode] of [
    [80, 24, "dark", "fullscreen"], [140, 40, "light", "regular"],
    [40, 12, "system", "fullscreen"], [22, 8, "light", "regular"],
    [80, 24, "live-review", "fullscreen"],
  ]) {
    displayFixture = "rich";
    writeFileSync(join(root, "settings.json"), JSON.stringify({ theme, tuiMode: mode, quietStartup: true }));
    const matrixSession = `${session}-${width}`;
    // Automatic discovery is separate from the explicit index.ts loading above.
    const matrixCommand = command.replace(`pi --no-extensions -e ${quote(providerExtension)} -e ${quote(shellExtension)}`, "pi");
    tmux("new-session", "-d", "-s", matrixSession, "-x", String(width), "-y", String(height), "-c", root, matrixCommand);
    const screen = () => tmux("capture-pane", "-p", "-t", matrixSession);
    const until = async (check) => {
      const deadline = Date.now() + 15000;
      while (!check()) {
        if (Date.now() > deadline) throw new Error(`Matrix ${width}x${height}/${theme}/${mode}:\n${screen()}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    const key = (...keys) => tmux("send-keys", "-t", matrixSession, ...keys);
    const literal = (text) => key("-l", text);
    const submit = (text) => { literal(text); key("Enter"); };
    const editor = async () => {
      // Raw Escape can wait for disambiguation from Alt input; do not append typing to it.
      await until(() => !/CODEX QUOTA|LOCAL SHORTCUTS|Esc\/q close/.test(screen()));
      literal("focus-ok"); await until(() => screen().includes("focus-ok")); key("C-u"); await until(() => !screen().includes("focus-ok"));
    };
    try {
      await until(() => screen().includes("think"));
      submit("/quota"); await until(() => screen().includes("Account A"));
      console.log(`REVIEW ${width}x${height}/${theme}/${mode} compact:\n${screen()}`);
      if (theme === "live-review") {
        const title = () => tmux("capture-pane", "-p", "-e", "-t", matrixSession).split("\n").find((line) => line.includes("CODEX QUOTA"));
        const lightTitle = title(); const beforeTheme = managementRequests.length;
        writeFileSync(reviewTheme, JSON.stringify(themeFixture("dark")));
        await until(() => Boolean(title()) && title() !== lightTitle);
        assert.equal(managementRequests.length, beforeTheme, "theme invalidation must not fetch quota");
        tmux("resize-window", "-t", matrixSession, "-x", "40", "-y", "12");
        await until(() => screen().includes("CODEX QUOTA") && screen().includes("Esc/q close") && !screen().includes("↑↓/jk move"));
        tmux("resize-window", "-t", matrixSession, "-x", "80", "-y", "24");
        await until(() => screen().includes("↑↓/jk move"));
        console.log("PASS installed Pi open popup: watched light-to-dark theme invalidation and 80x24 → 40x12 → 80x24 resize, no quota requests");
      }
      key("Enter"); await until(() => screen().includes("▾ Account A"));
      // Stop at the focused card's final detail, not the end of the following cards.
      for (let i = 0; i < 120 && !screen().includes("Credits:"); i++) {
        const before = screen(); key("PageDown"); await until(() => screen() !== before);
      }
      assert.match(screen(), /Credits:/, "all tall-card details must be reachable");
      console.log(`REVIEW ${width}x${height}/${theme}/${mode} expanded tail:\n${screen()}`);
      key("PageUp"); key("Home"); await until(() => screen().includes("Account A"));
      key("Down"); literal("k"); literal("j"); key("Up");
      literal("h"); key("Right"); literal("l"); key("Left");
      key("End"); await until(() => screen().includes("Disabled"));
      key("Home"); await until(() => screen().includes("Account A"));
      literal("?"); await until(() => screen().includes("LOCAL SHORTCUTS"));
      literal("?"); await until(() => screen().includes("Account A"));
      displayFixture = "failure"; literal("r"); await until(() => screen().includes("Stale"));
      assert.doesNotMatch(screen(), /private-upstream-body|management-smoke-only/);
      displayFixture = "rich"; literal("r"); await until(() => !screen().includes("Stale") && !screen().includes("Refreshing"));
      displayFixture = "failed-probe"; literal("r"); key("Home");
      await until(() => /check\s+failed/.test(screen().replace(/│/g, " ")));
      literal("l");
      let sawProbeError = false, sawModelCooldown = false;
      for (let i = 0; i < 30; i++) {
        const view = screen();
        // Wrapping can split a status code or hyphenated model ID across body rows.
        const text = view.replace(/[│╭╮╰╯─\s]/g, "");
        sawProbeError ||= text.includes("HTTP401"); sawModelCooldown ||= text.includes("gpt-ui-cooldown");
        assert.doesNotMatch(view, /private-upstream-body|management-smoke-only/);
        if (sawProbeError && sawModelCooldown) break;
        key("PageDown"); await until(() => screen() !== view);
      }
      assert.ok(sawProbeError && sawModelCooldown, `failed account must retain its model cooldown on expansion (error=${sawProbeError}, cooldown=${sawModelCooldown}):\n${screen()}`);
      console.log(`PASS installed Pi ${width}x${height}/${theme}/${mode}: failed usage probe retains reachable model scheduler cooldown`);
      literal("q"); await editor();
      submit("/context"); await until(() => /System prompt|System/.test(screen()));
      literal("?"); await until(() => screen().includes("LOCAL SHORTCUTS"));
      literal("j"); literal("k"); key("PageDown"); key("PageUp");
      literal("?"); await until(() => /System prompt|System/.test(screen()));
      literal("q"); await editor();
      submit("/context"); await until(() => /System prompt|System/.test(screen()));
      literal("?"); await until(() => screen().includes("LOCAL SHORTCUTS"));
      key("Escape"); await editor();
      submit("/context"); await until(() => /System prompt|System/.test(screen())); key("Escape"); await editor();
      console.log(`PASS installed Pi context help: ${width}x${height}, ? toggling, help navigation, Escape completion and editor focus`);
      displayFixture = "empty"; submit("/quota"); await until(() => screen().includes("No Codex")); key("Escape"); await editor();
      displayFixture = "failure"; submit("/quota"); await until(() => screen().includes("Check failed")); literal("q"); await editor();
      displayFixture = "normal"; const beforeReload = catalogRequests; submit("/reload");
      // The reload notification can scroll off a tiny regular-mode viewport.
      await until(() => catalogRequests === beforeReload + 1);
      submit("/quota"); await until(() => screen().includes("CODEX QUOTA") && !screen().includes("Loading"));
      for (let i = 0; i < 20 && !screen().includes("40% used"); i++) { const before = screen(); key("PageDown"); await until(() => screen() !== before); }
      assert.match(screen(), /40% used/); literal("q"); await editor();
      assert.equal(catalogRequests, beforeReload + 1, "reload must load the single provider entry exactly once");
      console.log(`PASS installed Pi automatic folder/reload: ${width}x${height}, ${theme}, ${mode}, tall-card paging/all local keys, stale/error/empty states, quota/context q/Escape and editor focus`);
    } finally { tmux("kill-session", "-t", matrixSession); }
  }
  assert.equal(requests.length, beforeMatrix, "terminal review must not submit inference");
} finally {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

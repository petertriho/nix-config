import assert from "node:assert/strict";
import test from "node:test";
import { getThemeByName, loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import { loadQuotaSnapshot, type QuotaAccount, type QuotaSnapshot } from "../pi-cliproxyapi-provider/quota.ts";
import { presentQuotaWindow, QuotaModal, type QuotaUIOptions } from "../pi-cliproxyapi-provider/quota-ui.ts";

const now = 1_800_000_000_000;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const account = (authIndex = "a", extra: Partial<QuotaAccount> = {}): QuotaAccount => ({ authIndex, label: `Account ${authIndex}`, provider: "codex", disabled: false, unavailable: false, eligible: "unknown", windows: [{ label: "Generation primary", scope: "account", usedPercent: 40, durationSeconds: 7200, resetAt: now + 60_000 }], ...extra });
const snapshot = (...accounts: QuotaAccount[]): QuotaSnapshot => ({checkedAt:now, accounts});
function harness(options: QuotaUIOptions, rows = 40) {
	let renders=0, closes=0;
	const tui={terminal:{rows},requestRender:()=>{renders++;}};
	const colors: string[]=[];
	const theme={fg:(color:string,text:string)=>{colors.push(color);return text;}};
	const modal=new QuotaModal(tui,theme,new KeybindingsManager(TUI_KEYBINDINGS),()=>{closes++;}, {now:()=>now, scheduleTick:()=>()=>{},...options});
	return {modal,tui,colors,display:(width=104)=>modal.render(width).join("\n"),renders:()=>renders,closes:()=>closes};
}

test("used quota stays truthful at thresholds, explicit limits, invalid and over-100 values", () => {
	for (const [percent, severity] of [[0, "success"], [79.9, "success"], [80, "warning"], [94.9, "warning"], [95, "error"], [130, "error"]] as const) {
		const result = presentQuotaWindow({ label: "Generation", scope: "account", usedPercent: percent });
		assert.equal(result.severity, severity);
		assert.match(result.usage, new RegExp(`${percent}% used`));
		assert.match(result.usage, new RegExp(`${Number(Math.max(0, 100-percent).toFixed(1))}% left`));
		assert.equal(result.fillPercent, Math.min(100, percent));
	}
	for (const usedPercent of [undefined, NaN, Infinity, -1]) {
		assert.deepEqual(presentQuotaWindow({ label: "Generation", scope: "account", usedPercent }), { severity: "muted", usage: "usage unknown" });
	}
	for (const flag of [{allowed:false}, {limitReached:true}]) {
		const result = presentQuotaWindow({label:"Generation", scope:"account", usedPercent:2, ...flag});
		assert.equal(result.severity,"error");
		assert.match(result.usage,/limited/);
	}
});

test("stacked generation cards show account check state, actual durations, safe labels and no invented scope", async () => {
	const h=harness({inspect:async()=>snapshot(account("a",{label:"界\x1b]0;attack\x07\nAccount",windows:[{label:"Generation custom",scope:"account",usedPercent:130,durationSeconds:7200},{label:"Review",scope:"review",limitReached:true}]}),account("b",{disabled:true}),account("c",{unavailable:true,error:"Check account authentication and retry.",windows:[]}),account("d",{windows:[],hasCredits:true}))},200);
	assert.match(h.display(),/Loading/);
	await flush();
	const text=h.display();
	assert.match(text,/Generation custom.*2h/s);
	assert.match(text,/130% used.*0% left/s);
	assert.match(text,/disabled.*not probed/s);
	assert.match(text,/unavailable.*authentication/s);
	assert.match(text,/generation windows unavailable/i);
	assert.doesNotMatch(text,/attack|Review|balance|current model|routed account|ready/);
	assert.match(text,/live usage checked/);
	assert.ok(text.indexOf("Account b")<text.indexOf("Account c"));
	h.modal.dispose();
});

test("failed usage probes retain independent model scheduler details on expansion", async () => {
	let time = now;
	const resetAt = now + 60_000;
	const listing = { files: [{
		auth_index: "a", name: "codex-a.json", label: "Synthetic account", provider: "codex",
		disabled: false, unavailable: true, id_token: { chatgpt_account_id: "mock-account-a" },
		cooldowns: [{ scope: "model", model_key: "gpt-cooldown", reason: "transient_error",
			retry_at: new Date(resetAt).toISOString(), remaining_seconds: 60 }],
	}] };
	const data = await loadQuotaSnapshot({
		baseUrl: "http://127.0.0.1:8317/v1", managementKey: "synthetic-management", now,
		fetchImpl: async (input) => new Response(JSON.stringify(String(input).endsWith("/credentials")
			? listing : { status_code: 401, body: "private-upstream-body" }),
			{ status: 200, headers: { "Content-Type": "application/json" } }),
	});
	assert.match(data.accounts[0]!.error!, /HTTP 401/);
	assert.deepEqual(data.accounts[0]!.windows.map((window) => [window.label, window.scope, window.modelId, window.resetAt]),
		[["Scheduler cooldown", "model", "gpt-cooldown", resetAt]]);
	const h = harness({ inspect: async () => data, now: () => time }, 100);
	try {
		await flush();
		assert.match(h.display(), /check failed.*HTTP 401/s);
		assert.doesNotMatch(h.display(), /Scheduler cooldown|gpt-cooldown/);
		h.modal.handleInput("l");
		const expanded = h.display();
		assert.match(expanded, /check failed.*HTTP 401/s);
		assert.match(expanded, /Scheduler cooldown \[model gpt-cooldown\]/);
		assert.match(expanded, /not subscription quota.*reset in 1\.0m/s);
		assert.ok(expanded.includes(new Date(resetAt).toISOString()));
		assert.doesNotMatch(expanded, /% used|Generation primary|live usage checked|private-upstream-body|synthetic-management/);
		time = resetAt + 1;
		assert.match(h.display(), /refresh required/);
		h.modal.handleInput("h");
		assert.match(h.display(), /HTTP 401/);
		assert.doesNotMatch(h.display(), /Scheduler cooldown|gpt-cooldown/);
	} finally { h.modal.close(); }
});

test("reset countdowns use the largest unit with one decimal or whole seconds", async () => {
	for (const [seconds, expected] of [
		[0.001, "1s"], [1, "1s"], [42.1, "43s"], [59.9, "60s"],
		[60, "1.0m"], [90, "1.5m"], [3599, "60.0m"],
		[3600, "1.0h"], [5400, "1.5h"], [86399, "24.0h"],
		[86400, "1.0d"], [129600, "1.5d"], [604800, "7.0d"],
	] as const) {
		const h = harness({ inspect: async () => snapshot(account("a", {
			windows: [{ label: "Generation primary", scope: "account", usedPercent: 40,
				durationSeconds: 7200, resetAt: now + seconds * 1000 }],
		})) });
		try {
			await flush();
			assert.ok(h.display().includes(`reset in ${expected}`), `${seconds}s should show ${expected}`);
			assert.match(h.display(), /Generation primary · 2h/, "quota window duration stays unchanged");
		} finally { h.modal.close(); }
	}
});

test("reset countdowns keep expired, unknown and invalid-clock states truthful", async () => {
	for (const resetAt of [undefined, NaN, Infinity, -1, 8.64e15 + 1, now, now - 1]) {
		const h = harness({ inspect: async () => snapshot(account("a", {
			windows: [{ label: "Generation", scope: "account", resetAt }],
		})) });
		try {
			await flush();
			assert.match(h.display(), resetAt === now || resetAt === now - 1 ? /refresh required/ : /reset unknown/);
			assert.doesNotMatch(h.display(), /reset in (?:NaN|Infinity|-|0s)/);
		} finally { h.modal.close(); }
	}
	const invalidClock = harness({ now: () => NaN, inspect: async () => snapshot(account()) });
	try { await flush(); assert.match(invalidClock.display(), /reset unknown/); }
	finally { invalidClock.modal.close(); }
});

test("scheduler reset countdowns share the compact format and retain exact timestamps", async () => {
	const resetAt = now + 5400_000;
	const h = harness({ inspect: async () => snapshot(account("a", {
		nextRetryAt: resetAt,
		windows: [{ label: "Scheduler cooldown", scope: "model", modelId: "gpt-test", resetAt }],
	})) }, 100);
	try {
		await flush(); h.modal.handleInput("l");
		const text = h.display();
		assert.match(text, /Scheduler retry.*reset in 1\.5h/);
		assert.match(text, /Scheduler cooldown.*reset in 1\.5h/);
		assert.ok(text.includes(new Date(resetAt).toISOString()));
	} finally { h.modal.close(); }
});

test("roomy popups separate account cards and chrome while tiny popups stay compact", async () => {
	const plain = (lines: string[]) => lines.map((line) => line.replace(/^\s*│ /, "").replace(/ │\s*$/, "").trim());
	const h = harness({ inspect: async () => snapshot(account("a"), account("b")) }, 40);
	try {
		await flush();
		const roomy = plain(h.modal.render(80));
		const divider = roomy.findIndex((line) => /^─+$/.test(line));
		assert.ok(divider > 0);
		assert.equal(roomy[divider - 1], "", "leave a blank row above the account divider");
		assert.equal(roomy[divider + 1], "", "leave a blank row below the account divider");
		assert.match(roomy[divider + 2]!, /Account b/);
		const accountHeader = roomy.findIndex((line) => line.includes("Account a"));
		assert.equal(roomy[accountHeader - 1], "", "separate metadata from cards");
		const footer = roomy.findIndex((line) => line.includes("? help"));
		assert.equal(roomy[footer - 1], "", "separate cards from keyboard hints");

		h.tui.terminal.rows = 12;
		let compact = plain(h.modal.render(80));
		assert.ok(compact.every(Boolean), "do not spend the tiny body budget on blank padding");
		h.modal.handleInput("\x1b[F");
		assert.match(h.display(80), /› ▸ Account b/);
		compact = plain(h.modal.render(80));
		const compactDivider = compact.findIndex((line) => /^─+$/.test(line));
		assert.ok(compactDivider >= 0);
		assert.match(compact[compactDivider + 1]!, /Account b/);
		h.tui.terminal.rows = 40;
		h.modal.handleInput("\x1b[H");
		assert.match(h.display(80), /› ▸ Account a/);
		assert.ok(h.modal.render(80).every((line) => visibleWidth(line) <= 80));
	} finally { h.modal.close(); }

	const single = harness({ inspect: async () => snapshot(account()) }, 40);
	try {
		await flush();
		const lines = plain(single.modal.render(80));
		assert.equal(lines.filter((line) => /^─+$/.test(line)).length, 0);
		assert.equal(lines.filter((line) => !line).length, 2, "only chrome gaps, no extra single-card padding");
	} finally { single.modal.close(); }
});

test("card navigation, expansion, scoped details and in-modal help use every local key", async () => {
	const detailed=account("a",{hasCredits:false,nextRetryAt:now+30000,windows:[...account().windows,
		{label:"Model window",scope:"model",modelId:"gpt-test",usedPercent:95,resetAt:now+60000},
		{label:"Opaque window",scope:"model"},{label:"Review",scope:"review",usedPercent:100,limitReached:true},
		{label:"Scheduler cooldown",scope:"model",modelId:"gpt-other",allowed:false,resetAt:now+10000}]});
	const h=harness({inspect:async()=>snapshot(detailed,account("b"),account("c"))},100);
	await flush();
	for(const key of ["\x1b[B","j"]) h.modal.handleInput(key);
	assert.match(h.display(),/› ▸ Account c/);
	for(const key of ["\x1b[A","k"]) h.modal.handleInput(key);
	assert.match(h.display(),/› ▸ Account a/);
	for(const expand of ["\r","l","\x1b[C"]) {
		h.modal.handleInput(expand);
		const text=h.display();
		assert.match(text,/› ▾ Account a/);
		assert.match(text,/model gpt-test/);
		assert.match(text,/model applicability unknown/);
		assert.match(text,/review only/);
		assert.match(text,/Credits: not available/);
		assert.match(text,/Scheduler.*not subscription quota/s);
		assert.match(text,/2027-01-/);
		h.modal.handleInput("h");
		assert.doesNotMatch(h.display(),/Model window|Credits|Scheduler/);
	}
	h.modal.handleInput("l"); h.modal.handleInput("\x1b[D");
	assert.doesNotMatch(h.display(),/Model window/);
	h.modal.handleInput("\x1b[F"); assert.match(h.display(),/› ▸ Account c/);
	h.modal.handleInput("\x1b[H"); assert.match(h.display(),/› ▸ Account a/);
	h.modal.handleInput("?"); assert.match(h.display(),/LOCAL SHORTCUTS/);
	h.modal.handleInput("j"); h.modal.handleInput("?"); assert.match(h.display(),/› ▸ Account b/);
	h.modal.handleInput("q"); assert.equal(h.closes(),1);
	h.modal.handleInput("\x1b"); assert.equal(h.closes(),1);
});

test("inspection is fresh/manual only, coalesced, stale on whole failure, identity-preserving, and disposed safely", async () => {
	let time=now, tick: (()=>void)|undefined, cancelled=0;
	const pending: Array<{signal:AbortSignal;resolve:(snapshot:QuotaSnapshot)=>void;reject:(error:Error)=>void}>=[];
	const h=harness({now:()=>time,scheduleTick:(callback)=>{tick=callback;return()=>{cancelled++;};},inspect:(signal)=>new Promise((resolve,reject)=>{pending.push({signal,resolve,reject});})});
	await flush(); assert.equal(pending.length,1); assert.ok(tick);
	h.modal.handleInput("r"); h.modal.handleInput("r"); assert.equal(pending.length,1);
	pending[0]!.resolve(snapshot(account("a"),account("b"))); await flush();
	time+=61_000; tick!(); assert.equal(pending.length,1);
	assert.match(h.display(),/refresh required/); assert.match(h.display(),/40% used/);
	h.modal.handleInput("j"); h.modal.handleInput("l"); h.display();
	h.modal.handleInput("r"); h.modal.handleInput("r"); await flush(); assert.equal(pending.length,2);
	pending[1]!.reject(new Error("private-token upstream body")); await flush();
	assert.match(h.display(),/Stale/); assert.match(h.display(),/2027-01-15T08:00:00/);
	assert.doesNotMatch(h.display(),/private-token|upstream body/);
	h.modal.handleInput("r"); await flush(); pending[2]!.resolve(snapshot(account("b",{windows:[],error:"Reauthenticate and retry.",nextRetryAt:now+30000}),account("a",{windows:[{label:"Generation",scope:"account",usedPercent:20}]}))); await flush();
	assert.match(h.display(),/› ▸ Account b|› ▾ Account b/); assert.doesNotMatch(h.display(),/40% used|Stale/);
	h.modal.handleInput("r"); await flush(); pending[3]!.resolve(snapshot(account("a"))); await flush();
	assert.match(h.display(),/› ▸ Account a/);
	h.modal.handleInput("r"); await flush(); const active=pending[4]!;
	h.modal.close(); h.modal.close(); h.modal.dispose(); assert.equal(h.closes(),1); assert.equal(cancelled,1); assert.equal(active.signal.aborted,true);
	const renders=h.renders(); active.resolve(snapshot(account("late"))); tick!(); await flush();
	assert.equal(h.renders(),renders); assert.equal(h.display(),""); assert.equal(pending.length,5);
});

test("paging reaches every row of a tall card without snapping back, including after resize and collapse", async () => {
	const windows=Array.from({length:30},(_,i)=>({label:`Detail-${i}`,scope:"model" as const,modelId:`gpt-${i}`,usedPercent:i,resetAt:now+60000}));
	const h=harness({inspect:async()=>snapshot(account("a",{windows:[...account().windows,...windows],hasCredits:true}))},12);
	await flush(); h.modal.handleInput("l");
	const seen=new Set<number>();
	for(let i=0;i<80;i++) {
		const text=h.display(80); assert.equal(h.display(80),text,"ordinary render must not re-anchor focus");
		for(const match of text.matchAll(/Detail-(\d+)/g)) seen.add(Number(match[1]));
		h.modal.handleInput("\x1b[6~");
	}
	assert.equal(seen.size,30); assert.match(h.display(80),/Credits: available or unlimited/);
	h.modal.handleInput("\x1b[5~"); assert.doesNotMatch(h.display(80),/Credits:/);
	h.tui.terminal.rows=8; assert.ok(h.modal.render(40).length<=6);
	h.modal.handleInput("h"); assert.match(h.display(40),/Account a/);
	h.modal.dispose();
});

test("every width and short-height budget handles CJK, ANSI, controls, help and empty lists", async () => {
	const h=harness({inspect:async()=>snapshot(account("a",{label:"界".repeat(90)+"\x1b[2J\x1b]0;bad\x07\r\n\u202e",windows:[{label:"未知界".repeat(40),scope:"account",usedPercent:NaN}]}))});
	await flush();
	for(const width of [1,8,14,40,80,140]) for(const rows of [1,2,4,6,8,12,24,40]) {
		h.tui.terminal.rows=rows;
		for(const help of [false,true]) {
			if(help)h.modal.handleInput("?");
			const lines=h.modal.render(width);
			assert.ok(lines.length<=rows,`${width}x${rows}: ${lines.length}`);
			assert.ok(lines.every(line=>visibleWidth(line)<=width),`${width}x${rows} overflow`);
			assert.doesNotMatch(lines.join(""),/bad|\x1b\[2J|\u202e/);
			if(help)h.modal.handleInput("?");
		}
	}
	h.modal.dispose();
	const empty=harness({inspect:async()=>snapshot()}); await flush(); assert.match(empty.display(),/No Codex accounts found/); empty.modal.close();
});

for(const state of ["loading","normal","error","help"] as const) for(const key of ["q","\x1b"]) {
	test(`${JSON.stringify(key)} completes ${state} through the same callback, including retry`,async()=>{
		const fail=state==="error"; let signal:AbortSignal|undefined;
		const h=harness({inspect:async(s)=>{signal=s;if(state==="loading")return new Promise(()=>{});if(fail)throw new Error("secret upstream response");return snapshot(account());}});
		await flush();
		if(state==="error") {assert.match(h.display(),/r retry|r refresh/);assert.doesNotMatch(h.display(),/secret/);}
		if(state==="help")h.modal.handleInput("?");
		h.modal.handleInput(key);assert.equal(h.closes(),1);assert.equal(signal?.aborted,true);assert.equal(h.display(),"");
	});
}

test("configured selection actions work alongside Vim aliases and help advertises them",async()=>{
	const tui={terminal:{rows:40},requestRender:()=>{}};
	const keys=new KeybindingsManager(TUI_KEYBINDINGS,{"tui.select.down":"ctrl+n","tui.select.up":"ctrl+p","tui.select.confirm":"space"});
	const modal=new QuotaModal(tui,{fg:(_c,text)=>text},keys,()=>{},{inspect:async()=>snapshot(account("a"),account("b")),scheduleTick:()=>()=>{},now:()=>now});
	await flush();modal.handleInput("\x0e");assert.match(modal.render(100).join(""),/› ▸ Account b/);
	modal.handleInput(" ");assert.match(modal.render(100).join(""),/› ▾ Account b/);
	modal.handleInput("k");assert.match(modal.render(100).join(""),/› ▸ Account a/);
	modal.handleInput("?");assert.match(modal.render(100).join(""),/ctrl\+n|ctrl\+p/);modal.dispose();
});

test("theme invalidation uses active light, dark and system colors with no width changes",async()=>{
	const load=(name:string)=>name==="system"?getThemeByName(name)!:loadThemeFromPath(new URL(`../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/${name}.json`,import.meta.url).pathname);
	let theme=load("dark");
	const modal=new QuotaModal({terminal:{rows:40},requestRender:()=>{}},{fg:(c,s)=>theme.fg(c,s)},new KeybindingsManager(TUI_KEYBINDINGS),()=>{},{inspect:async()=>snapshot(account()),now:()=>now,scheduleTick:()=>()=>{}});
	await flush();const dark=modal.render(80).join("\n");
	for(const name of ["light","system","dark"]) {
		theme=load(name);modal.invalidate();const lines=modal.render(80);
		assert.ok(lines.every(line=>visibleWidth(line)<=80));assert.match(lines.join(""),/40% used/);
		if(name==="light")assert.notEqual(lines.join("\n"),dark);
	}
	modal.close();
});

test("initial failure can retry successfully; closing before queued opening performs no inspection",async()=>{
	let calls=0;
	const h=harness({inspect:async()=>{if(++calls===1)throw new Error("private");return snapshot(account());}});
	await flush();assert.match(h.display(),/check the management API/);h.modal.handleInput("r");await flush();assert.match(h.display(),/40% used/);h.modal.close();
	const before=calls;const early=harness({inspect:async()=>{calls++;return snapshot();}});early.modal.close();await flush();assert.equal(calls,before);assert.equal(early.closes(),1);
});

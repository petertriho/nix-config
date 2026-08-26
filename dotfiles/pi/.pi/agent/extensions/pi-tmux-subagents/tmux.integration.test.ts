import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeSurface, createSurface, pollForExit, sendLongCommand } from "./tmux.ts";

const insideTmux = !!process.env.TMUX;

test(
	"tmux pane lifecycle: create, run a command, detect the sentinel, close",
	{ skip: !insideTmux && "TMUX is not set", timeout: 30_000 },
	async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-tmux-subagents-it-"));
		let pane: string | undefined;
		try {
			pane = createSurface("it-echo");
			assert.match(pane, /^%\d+$/);
			// Give the shell in the new pane time to start before sending keys.
			await new Promise((resolve) => setTimeout(resolve, 1500));

			sendLongCommand(pane, "true; echo '__SUBAGENT_DONE_'$?'__'", {
				scriptPath: join(dir, "cmd.sh"),
			});
			const result = await pollForExit(pane, AbortSignal.timeout(20_000), { interval: 200 });
			assert.deepEqual(result, { reason: "sentinel", exitCode: 0 });
		} finally {
			if (pane) {
				closeSurface(pane);
				const panes = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], {
					encoding: "utf8",
				})
					.split("\n")
					.map((line) => line.trim());
				assert.equal(panes.includes(pane), false, `pane ${pane} still listed`);
			}
			rmSync(dir, { recursive: true, force: true });
		}
	},
);

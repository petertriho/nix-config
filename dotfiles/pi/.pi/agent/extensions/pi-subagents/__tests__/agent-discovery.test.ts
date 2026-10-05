import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentDiscovery } from "../profiles/discovery.ts";

test("discovery preserves distinct filename spawn identities with the same display name", (t) => {
	const root = mkdtempSync(join(tmpdir(), "pi-agent-discovery-"));
	const packageDir = join(root, "package");
	const agentDir = join(root, "global");
	const projectDir = join(root, "project");
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	try {
		for (const dir of [join(packageDir, "agents"), join(agentDir, "agents"), join(projectDir, ".pi", "agents")]) {
			mkdirSync(dir, { recursive: true });
		}
		process.env.PI_CODING_AGENT_DIR = agentDir;
		t.mock.method(process, "cwd", () => projectDir);
		writeFileSync(join(packageDir, "agents", "scout.md"), "---\nname: Shared display\nmodel: p/scout\n---\nScout body");
		writeFileSync(join(agentDir, "agents", "planner.md"), "---\nname: Shared display\nmodel: p/planner\n---\nPlanner body");

		const discovery = createAgentDiscovery(packageDir);
		const agents = discovery.discoverAgentDefinitions();
		assert.deepEqual(agents.map(({ fileName }) => fileName).sort(), ["planner", "scout"]);
		for (const agent of agents) {
			assert.equal(agent.name, "Shared display");
			assert.equal(discovery.loadAgentDefaults(agent.fileName)?.model, agent.model);
			assert.equal(discovery.loadAgentDefaults(agent.fileName)?.body, agent.body);
		}
	} finally {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	}
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BUNDLED_AGENTS_DIR, describeAgentTypes, discoverAgentTypes, findAgentType, parseAgentType,
} from "../agent-types.ts";

function scratch(): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "pi-tmux-agents-types-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("parseAgentType reads the frontmatter and the body", () => {
  const type = parseAgentType([
    "---",
    "name: Review",
    'description: "Reviews   the diff."',
    "tools: read, grep  ls",
    "model: anthropic/x",
    "thinking: high",
    "auto-stop: true",
    "---",
    "",
    "Review the diff.",
    "",
  ].join("\n"), "/p/Review.md", "project");
  assert.deepEqual(type, {
    name: "Review", description: "Reviews the diff.", tools: "read,grep,ls", model: "anthropic/x",
    thinking: "high", autoStop: true, prompt: "Review the diff.", source: "project", path: "/p/Review.md",
  });
  const plain = parseAgentType("---\nname: x\ndescription: y\n---\n", "/p/x.md", "bundled");
  assert.deepEqual(plain, { name: "x", description: "y", autoStop: false, prompt: "", source: "bundled", path: "/p/x.md" });
});

test("parseAgentType gives no type without a valid name or a description", () => {
  assert.equal(parseAgentType("name: x\ndescription: y\n", "/p", "bundled"), undefined, "no frontmatter");
  assert.equal(parseAgentType("---\ndescription: y\n---\n", "/p", "bundled"), undefined, "no name");
  assert.equal(parseAgentType("---\nname: x\n---\n", "/p", "bundled"), undefined, "no description");
  assert.equal(parseAgentType("---\nname: a b\ndescription: y\n---\n", "/p", "bundled"), undefined, "a space");
  assert.equal(parseAgentType("---\nname: -x\ndescription: y\n---\n", "/p", "bundled"), undefined, "a leading -");
});

test("the bundled types are general-purpose, Explore, and Plan", () => {
  const types = discoverAgentTypes();
  assert.deepEqual(types.map((type) => [type.name, type.tools ?? "", type.autoStop, type.source]), [
    ["Explore", "read,grep,find,ls", true, "bundled"],
    ["general-purpose", "", false, "bundled"],
    ["Plan", "read,grep,find,ls", true, "bundled"],
  ]);
  for (const type of types) {
    assert.ok(type.prompt.length > 0, type.name);
    assert.ok(type.path.startsWith(BUNDLED_AGENTS_DIR), type.name);
  }
});

test("project types load only in a trusted project, and replace a bundled type of the same name", () => {
  const { dir, cleanup } = scratch();
  try {
    const agents = join(dir, ".pi", "agents");
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(agents, "Explore.md"), "---\nname: Explore\ndescription: Project search.\n---\nSearch.\n");
    writeFileSync(join(agents, "review.md"), "---\nname: review\ndescription: Reviews.\nauto-stop: true\n---\n");
    writeFileSync(join(agents, "bad.md"), "---\nname: bad name\ndescription: x\n---\n");
    writeFileSync(join(agents, "notes.txt"), "---\nname: notes\ndescription: x\n---\n");

    const untrusted = discoverAgentTypes({ cwd: dir, trusted: false });
    assert.deepEqual(untrusted.map((type) => type.name), ["Explore", "general-purpose", "Plan"]);
    assert.ok(untrusted.every((type) => type.source === "bundled"));

    const trusted = discoverAgentTypes({ cwd: dir, trusted: true });
    assert.deepEqual(trusted.map((type) => [type.name, type.source]), [
      ["Explore", "project"], ["general-purpose", "bundled"], ["Plan", "bundled"], ["review", "project"],
    ]);
    assert.equal(findAgentType(trusted, "Explore")?.description, "Project search.");
    assert.equal(findAgentType(trusted, "Explore")?.tools, undefined, "the project file replaces all fields");
  } finally {
    cleanup();
  }
});

test("findAgentType defaults to general-purpose and falls back to a case-insensitive match", () => {
  const types = discoverAgentTypes();
  assert.equal(findAgentType(types, undefined)?.name, "general-purpose");
  assert.equal(findAgentType(types, " ")?.name, "general-purpose");
  assert.equal(findAgentType(types, "explore")?.name, "Explore");
  assert.equal(findAgentType(types, "nope"), undefined);
  assert.equal(findAgentType([], undefined), undefined);
});

test("describeAgentTypes gives one line for each type with its tools and auto-stop", () => {
  const text = describeAgentTypes(discoverAgentTypes());
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^- Explore: .+ \(tools: read, grep, find, ls; the window closes after the result\)$/);
  assert.match(lines[1], /^- general-purpose: [^(]+$/);
  assert.equal(describeAgentTypes([]), "No agent types are available.");
});

"""Generate the Claude Code agents that EGM skills define at runtime.

Claude Code cannot define a subagent at runtime, so this script turns each
runtime registration in the skills into a user-level agent file. It stops the
build when upstream changes the agent types, so that the generated agents do
not drift from upstream or duplicate an agent that the plugin ships.
"""

import argparse
import json
import pathlib
import re
import sys
import textwrap

NIX_FILE = "pkgs/elephant-goldfish-model/default.nix"
BULLET = re.compile(r"^(?P<indent>\s*)\*\s+`(?P<key>\w+)`:\s*(?P<value>.*)$")
FRONTMATTER_NAME = re.compile(r"^name:\s*(\S+)\s*$", re.M)
EGM_NAME = re.compile(r"(?<![\w/.-])egm-[a-z0-9-]*[a-z0-9]")
REGISTRATION_KEYS = {
    "name",
    "description",
    "system_prompt",
    "enable_write_tools",
    "enable_subagent_tools",
}
READ_ONLY_TOOLS = ["Read", "Grep", "Glob"]


def fail(message):
    sys.exit(f"elephant-goldfish-model: {message}")


def clean(value):
    value = value.strip()
    if value.startswith(">-"):
        value = value[2:].strip()
    if len(value) > 1 and value[0] == value[-1] == "`" and "`" not in value[1:-1]:
        value = value[1:-1]
    return value


def parse_registrations(skill_file):
    """Return each bullet list that starts with `name` in one SKILL.md file.

    A registration is a run of "*   `key`: value" bullets at one indent.
    Deeper lines continue the value of the bullet above them.
    """
    lines = skill_file.read_text().splitlines()
    registrations = []
    i = 0
    while i < len(lines):
        start = BULLET.match(lines[i])
        if not start or start["key"] != "name":
            i += 1
            continue
        indent = len(start["indent"])
        fields = {}
        key = None
        while i < len(lines):
            line = lines[i]
            bullet = BULLET.match(line)
            if bullet and len(bullet["indent"]) == indent:
                key = bullet["key"]
                if key in fields:
                    fail(f"{skill_file}: a registration repeats `{key}`")
                fields[key] = [bullet["value"]]
            elif line.strip() and len(line) - len(line.lstrip()) > indent:
                fields[key].append(line.strip())
            else:
                break
            i += 1
        registrations.append({k: clean(" ".join(v)) for k, v in fields.items()})
    return registrations


def shipped_agents(root):
    manifest = json.loads((root / ".claude-plugin/plugin.json").read_text())
    names = set()
    for rel in manifest.get("agents", []):
        match = FRONTMATTER_NAME.search((root / rel).read_text())
        if not match:
            fail(f"{rel} has no frontmatter `name`")
        names.add(match[1])
    return names


def check_named_agents(root, skills, shipped):
    """Fail when the docs name an `egm-*` agent that has no Claude adapter."""
    paths = [
        *(root / "skills").rglob("*.md"),
        *(root / "agents").glob("*.md"),
        *(root / "resources").rglob("*.md"),
    ]
    named = set()
    for path in paths:
        named.update(EGM_NAME.findall(path.read_text()))
    unknown = sorted(named - skills - shipped)
    if unknown:
        fail(
            "the skills name agent types that the plugin does not ship for "
            f"Claude Code: {', '.join(unknown)}. Check whether upstream added a "
            "persona without a Claude adapter in .claude-plugin/agents/."
        )


def check_runtime_agents(found, expected, shipped):
    for name in sorted(expected):
        for candidate in (name, f"egm-{name}"):
            if candidate in shipped:
                fail(
                    f"upstream now ships the Claude agent egm:{candidate}. "
                    f"Remove {name} from claudeRuntimeAgents in {NIX_FILE}."
                )
    removed = sorted(expected - found.keys())
    if removed:
        fail(
            f"the skills no longer define {', '.join(removed)} at runtime. "
            "Check how upstream spawns it now, then remove it from "
            f"claudeRuntimeAgents in {NIX_FILE}."
        )
    added = sorted(found.keys() - expected)
    if added:
        fail(
            f"the skills now define {', '.join(added)} at runtime. Add each "
            f"one to claudeRuntimeAgents in {NIX_FILE}."
        )


def render_agent(name, skill, registration):
    keys = set(registration)
    if keys != REGISTRATION_KEYS:
        fail(
            f"{skill} registers {name} with keys {sorted(keys)}, not "
            f"{sorted(REGISTRATION_KEYS)}. Update render_agent in this script."
        )
    if (
        registration["enable_write_tools"] != "false"
        or registration["enable_subagent_tools"] != "false"
    ):
        fail(
            f"{skill} no longer registers {name} as read-only. Update the "
            "tool list in render_agent in this script."
        )
    description = (
        f"{registration['description'].rstrip('.')}. "
        f"Spawned by the EGM {skill} skill."
    )
    # JSON strings and arrays are valid YAML, so the values need no escaping.
    return "\n".join(
        [
            "---",
            f"name: {json.dumps(name)}",
            f"description: {json.dumps(description)}",
            f"tools: {json.dumps(READ_ONLY_TOOLS)}",
            "model: inherit",
            "omitClaudeMd: true",
            "---",
            "",
            textwrap.fill(registration["system_prompt"], width=79),
            "",
        ]
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin_root", type=pathlib.Path)
    parser.add_argument("out_dir", type=pathlib.Path)
    parser.add_argument("expected", nargs="*", help="claudeRuntimeAgents from Nix")
    args = parser.parse_args()
    root = args.plugin_root

    skills = {p.parent.name for p in (root / "skills").glob("*/SKILL.md")}
    shipped = shipped_agents(root)
    check_named_agents(root, skills, shipped)

    found = {}
    for skill_file in sorted((root / "skills").glob("*/SKILL.md")):
        for registration in parse_registrations(skill_file):
            name = registration.get("name")
            if not name:
                fail(f"{skill_file}: a registration has an empty `name`")
            if name in found and found[name][1] != registration:
                fail(f"two skills define {name} with different settings")
            found[name] = (skill_file.parent.name, registration)

    expected = set(args.expected)
    check_runtime_agents(found, expected, shipped)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name in sorted(expected):
        skill, registration = found[name]
        (args.out_dir / f"{name}.md").write_text(
            render_agent(name, skill, registration)
        )


if __name__ == "__main__":
    main()

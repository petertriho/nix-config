"""Fresh paired or current-only Pi sessions; dry-run unless --execute is supplied."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import shutil
import signal
import sys
import time

from build_fixtures import conditions, save, snapshot

SOURCE = Path(__file__).resolve().parent


def command_for(run, prompt, args):
    command = [args.pi, "--mode", "json", "-p", "--no-extensions"]
    for extension in args.provider_extension:
        command += ["-e", str(extension.resolve())]
    return command + [
        "-e", str(SOURCE / "fixture-tools.ts"), "--no-context-files",
        "--no-skills", "--no-prompt-templates", "--no-themes", "--no-builtin-tools",
        "--no-approve", "--provider", args.provider, "--model", args.model,
        "--thinking", args.thinking, "--session", str(run / "session.jsonl"),
        "--system-prompt", "You are a coding assistant.", prompt,
    ]


async def subject(case, version, args):
    run = args.workspace / "runs" / f"eval-{case['id']}" / version
    prompt = "Read your assigned skill at skill/SKILL.md (supporting files under skill/references/), then execute this task using the fixture tools:\n\n" + case["prompt"]
    command = command_for(run, prompt, args)
    if not args.execute:
        print(json.dumps({"dry_run": True, "run": str(run), "command": command}))
        return
    # Exclusive marker survives failures: reruns require a NEW workspace.
    with (run / "started.json").open("x") as stream:
        json.dump({"provider": args.provider, "model": args.model}, stream)
    env = {k: v for k, v in os.environ.items() if not k.startswith("PI_SUBAGENT")
           and k not in {"PI_DENY_TOOLS", "PI_SESSION_FILE", "PI_SESSION_ID"}}
    env.update(EVAL_RUN=str(run), EVAL_VERSION=version,
               EVAL_EXTENSION=str(SOURCE / "fixture-tools.ts"),
               EVAL_PYTHON=sys.executable, PI_SKIP_VERSION_CHECK="1",
               PI_TELEMETRY="0", PYTHONDONTWRITEBYTECODE="1")
    save(run / "subject-prompt.txt", prompt)
    save(run / "launch.json", {"command": command, "fork": False, "provider": args.provider,
                              "model": args.model, "thinking_requested": args.thinking,
                              "timeout_seconds": 480, "turn_limit": 24})
    started = time.time()
    with (run / "events.jsonl").open("wb") as out, (run / "stderr.txt").open("wb") as err:
        process = await asyncio.create_subprocess_exec(
            *command, cwd=run / "fixture", env=env, stdout=out, stderr=err, start_new_session=True)
        timeout = False
        try:
            await asyncio.wait_for(process.wait(), timeout=480)
        except asyncio.TimeoutError:
            timeout = True
            os.killpg(process.pid, signal.SIGKILL)
            await process.wait()
    finished = time.time()
    session = run / "session.jsonl"
    entries = [json.loads(line) for line in session.read_text().split("\n") if line] if session.exists() else []
    messages = [entry["message"] for entry in entries if entry.get("type") == "message"]
    save(run / "transcript.json", messages)
    assistants = [m for m in messages if m.get("role") == "assistant"]
    save(run / "model-evidence.json", {
        "requested": {"provider": args.provider, "model": args.model, "thinking": args.thinking},
        "model_changes": [e for e in entries if e.get("type") == "model_change"],
        "thinking_changes": [e for e in entries if e.get("type") == "thinking_level_change"],
        "assistant_models": sorted({(m.get("provider"), m.get("model"), m.get("api")) for m in assistants}),
        "provider_errors": [m.get("errorMessage") for m in assistants if m.get("stopReason") == "error"],
        "usage": [m.get("usage") for m in assistants],
        "reasoning_comparability": "Same requested level is not evidence of equivalent provider reasoning.",
    })
    tokens = [m.get("usage", {}).get("totalTokens") for m in assistants]
    duration = finished - started
    save(run / "timing.json", {
        "total_tokens": sum(tokens) if tokens and all(t is not None for t in tokens) else None,
        "duration_ms": round(duration * 1000), "total_duration_seconds": duration,
        "measurement": "Wall time at process completion; provider-reported usage; missing usage stays null",
    })
    final_state = snapshot(run / "fixture")
    save(run / "final-state.json", final_state)
    if "DEBUG.md" in final_state["files"]:
        save(run / "outputs/DEBUG.md", final_state["files"]["DEBUG.md"])
    final = "\n\n".join(block["text"] for m in assistants[-1:] for block in m.get("content", []) if block.get("type") == "text")
    save(run / "outputs/final.md", final)
    completion = {"exit_code": process.returncode, "timeout": timeout, "started": started,
                  "finished": finished, "assistant_messages": len(assistants),
                  "fresh_no_parent": bool(entries) and "parentSession" not in entries[0],
                  "last_stop_reason": assistants[-1].get("stopReason") if assistants else None}
    save(run / "completion.json", completion)
    print(json.dumps({"completed": str(run), **completion}), flush=True)


async def main(args):
    cases = json.loads((args.workspace / "evals.json").read_text())["evals"]
    # Validate the entire batch before launching any paid work.
    for case in cases:
        for version in conditions(args.workspace):
            run = args.workspace / "runs" / f"eval-{case['id']}" / version
            if not (run / "initial-state.json").is_file():
                raise ValueError(f"Build fixtures first: {run}")
            if any((run / name).exists() for name in ("started.json", "session.jsonl", "completion.json")):
                raise FileExistsError(f"Refusing to reuse a started run: {run}")
    if args.execute and not shutil.which(args.pi):
        raise ValueError("Pi executable unavailable")
    # Cases are sequenced; at most two conditions launch together.
    for case in cases:
        await asyncio.gather(*(subject(case, version, args) for version in conditions(args.workspace)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=lambda p: Path(p).resolve())
    parser.add_argument("--provider", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--pi", default="pi")
    parser.add_argument("--provider-extension", action="append", type=Path, default=[])
    parser.add_argument("--thinking", choices=["off", "minimal", "low", "medium", "high", "xhigh", "max"], default="medium")
    parser.add_argument("--execute", action="store_true")
    asyncio.run(main(parser.parse_args()))

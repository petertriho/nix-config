"""Capability interface, not a general-purpose security sandbox.

Invoke once per request: python backend.py RUN VERSION < request.json.
The coordinator, not the subject, controls RUN and VERSION.
"""
import ast
import contextlib
import datetime
import io
import json
import resource
import subprocess
import sys
import types
from pathlib import Path

from build_fixtures import git, inventory, snapshot


def confined(base, relative):
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or ".git" in path.parts:
        raise ValueError("Path is outside the exposed capability")
    result = base / path
    if result == base or base.is_symlink():
        raise ValueError("Fixture root is not a path capability")
    cursor = result
    while cursor != base:
        if cursor.is_symlink():
            raise ValueError("Symlinks are not exposed")
        cursor = cursor.parent
    return result


def mutate(run, action, args):
    root = run / "fixture"
    path = confined(root, args["path"])
    relative = str(path.relative_to(root))
    initial = json.loads((run / "initial-state.json").read_text())
    ledger = run / "owned-paths.json"
    owned = json.loads(ledger.read_text()) if ledger.exists() else []
    if action == "fixture_remove":
        if any(relative in initial[key] for key in ("files", "directories", "symlinks")):
            raise ValueError("Pre-existing paths cannot be removed")
        if relative not in owned:
            raise ValueError("Only harness-recorded investigation-owned paths can be removed")
        if path.is_dir():
            path.rmdir()
        else:
            path.unlink()
        owned.remove(relative)
    else:
        content = args["content"]
        if len(content.encode()) > 48000:
            raise ValueError("File limit exceeded")
        missing = []
        cursor = path.parent
        while cursor != root and not cursor.exists():
            missing.append(str(cursor.relative_to(root)))
            cursor = cursor.parent
        if not path.exists():
            missing.append(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        owned = sorted(set(owned + missing))
    ledger.write_text(json.dumps(owned))
    return "Done"


def evaluate(root, filename):
    """Child-process only: resource limits must not constrain the coordinator."""
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    allowed_attributes = {"fromisoformat", "timezone", "utc", "tzinfo", "replace", "utcoffset", "isoformat", "index", "append"}
    modules = {}

    class BoundedOutput(io.StringIO):
        def write(self, text):
            remaining = max(0, 24000 - self.tell())
            super().write(text[:remaining])
            return len(text)

    output = BoundedOutput()

    def load(source, name):
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.ClassDef, ast.With, ast.AsyncWith, ast.AsyncFunctionDef, ast.Global, ast.Nonlocal)):
                raise ValueError("Unsupported restricted evaluator syntax")
            if isinstance(node, ast.Name) and node.id.startswith("_"):
                raise ValueError("Private identifiers are unavailable")
            if isinstance(node, ast.Attribute) and node.attr not in allowed_attributes:
                raise ValueError("Attribute unavailable in restricted evaluator")
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = [node.module] if isinstance(node, ast.ImportFrom) else [alias.name for alias in node.names]
                if any(n not in {"datetime", "sandbox.parser", "offline_stub"} for n in names):
                    raise ValueError("Import unavailable in restricted evaluator")
        builtins = {"print": print, "len": len, "str": str, "int": int, "float": float,
                    "bool": bool, "dict": dict, "list": list, "range": range,
                    "enumerate": enumerate, "zip": zip, "isinstance": isinstance,
                    "TypeError": TypeError, "ValueError": ValueError, "Exception": Exception,
                    "__import__": importer}
        namespace = {"__builtins__": builtins}
        exec(compile(tree, name, "exec"), namespace)
        return types.SimpleNamespace(**{k: v for k, v in namespace.items() if not k.startswith("_")})

    def importer(name, globals=None, locals=None, fromlist=(), level=0):
        if level:
            raise ValueError("Relative imports unavailable")
        if name == "datetime":
            return types.SimpleNamespace(datetime=datetime.datetime, timezone=datetime.timezone)
        paths = {"sandbox.parser": "sandbox/parser.py", "offline_stub": "offline_stub.py"}
        if name not in paths:
            raise ValueError("Import unavailable")
        if name not in modules:
            modules[name] = load(confined(root, paths[name]).read_text(), paths[name])
        return modules[name]

    with contextlib.redirect_stdout(output):
        try:
            load(confined(root, filename).read_text(), filename)
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}")
    return output.getvalue()


def dispatch(run, version, action, args):
    root = run / "fixture"
    workspace = run.parents[2]
    if version not in ("with_skill", "old_skill"):
        raise ValueError("Unknown configuration")
    if action == "fixture_list":
        state = inventory(root)
        return sorted(list(state["files"]) + [d + "/" for d in state["directories"]])
    if action == "fixture_read":
        name = args["path"]
        if name.startswith("skill/"):
            relative = name[6:]
            if relative != "SKILL.md" and not relative.startswith("references/"):
                raise ValueError("Only assigned skill and references exposed")
            base = workspace / "snapshots" / ("current" if version == "with_skill" else "original")
            path = confined(base, relative)
        else:
            path = confined(root, name)
        text = path.read_text()
        start = max(0, int(args.get("offset", 1)) - 1)
        limit = max(0, min(500, int(args.get("limit", 500))))
        return "\n".join(text.splitlines()[start:start + limit])[:24000]
    if action in {"fixture_write", "fixture_remove"}:
        return mutate(run, action, args)
    if action == "fixture_state":
        return snapshot(root)
    if action == "fixture_command":
        command = args["command"].strip()
        if command in {"git status", "git status --short", "git diff", "git diff --cached", "git ls-files --stage"}:
            return git(root, *command.split()[1:])
        if command not in {"python run.py", "python probe/repro.py", "python3 run.py", "python3 probe/repro.py"}:
            return {"denied": True, "executed": False, "reason": "Inert interceptor: no shell or service execution capability"}
        counter = run / "runner-count.json"
        count = json.loads(counter.read_text()) if counter.exists() else 0
        if count >= 3:
            raise ValueError("Three-run bound reached")
        counter.write_text(json.dumps(count + 1))
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--evaluate", str(root), command.split()[1]],
            capture_output=True, text=True, timeout=10, check=True,
        )
        return {"run": count + 1, "engine": "restricted Python evaluator; no OS/network sandbox claim", "output": result.stdout[:24000]}
    if action == "log_query":
        if run.parent.name != "eval-8":
            raise ValueError("No query interface in this fixture")
        fields = args.get("fields", [])
        allowed = {"id", "parent", "error", "component", "redaction"}
        if args.get("projection") != "sanitized" or not fields or not set(fields) <= allowed or not 1 <= args.get("limit", 0) <= 3:
            raise ValueError("Only sanitized projection, allowlisted fields, limit 1 to 3 authorized")
        raw = json.loads((workspace / "grader-only/raw-logs.json").read_text())
        selected = raw if not args.get("id") else [row for row in raw if row["id"] == args["id"]]
        return [{key: ("credentials/customer/free-text excluded at source" if key == "redaction" else row[key]) for key in fields} for row in selected[:args["limit"]]]
    raise ValueError("Unknown capability")


if __name__ == "__main__":
    if sys.argv[1] == "--evaluate":
        print(evaluate(Path(sys.argv[2]), sys.argv[3]), end="")
    else:
        request = json.loads(sys.stdin.read())
        try:
            result = dispatch(Path(sys.argv[1]).resolve(), sys.argv[2], request["action"], request["args"])
            print(json.dumps({"ok": True, "result": result}))
        except Exception as exc:
            print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))

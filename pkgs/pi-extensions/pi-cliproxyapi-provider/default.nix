{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  piAiRuntime,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-cliproxyapi-provider";
  version = "1.4.0-unstable-2026-08-05";

  src = fetchFromGitHub {
    owner = "router-for-me";
    repo = "pi-cliproxyapi-provider";
    rev = "2b3da2e67c05bfeb843a986878f8972c8ae39199";
    hash = "sha256-q9LKYSRlYGFmadIJNVgQ3nviTBOgT2oQOxipEkErEwA=";
  };

  # Upstream registers a bespoke api id so it can ship a patched copy of pi-ai's
  # codex protocol. pi-cache-optimizer gates its Responses-family prompt-rewrite
  # bypass on a fixed list of api ids (index.ts:1393), which the bespoke id misses
  # — so it would reorder and compress prompts on the Codex backend, the failure
  # its own comments warn about (content_filter, blocked subagent calls). Renaming
  # the id restores the bypass; the extension still supplies its own streamSimple,
  # so pi's built-in codex adapter (which rejects non-JWT keys) is never used.
  # --replace-fail makes an upstream rename break the build rather than silently
  # reverting to the unpatched behaviour. The file's header comment still names
  # the old id; left alone deliberately, since realigning a comment is not worth
  # a second patch site to re-verify on every bump.
  postPatch = ''
    substituteInPlace extensions/codex-stream.ts \
      --replace-fail '"cliproxyapi-codex-responses" as const' '"openai-codex-responses" as const'
  '';

  dontBuild = true;

  # Upstream declares no `dependencies` — only peerDependencies. pi injects
  # @earendil-works/pi-coding-agent at runtime, but pi-ai must exist as a real
  # file because extensions/codex-stream.ts reads openai-codex-responses.js off
  # disk and rewrites it. pi is a Bun binary with pi-ai embedded, so it is linked
  # in from the pi-ai-runtime derivation instead.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-cliproxyapi-provider
    mkdir -p "$packageRoot"
    cp package.json README.md LICENSE "$packageRoot/"
    cp -r extensions "$packageRoot/"
    ln -s ${piAiRuntime}/lib/node_modules/pi-ai-runtime/node_modules "$packageRoot/node_modules"

    runHook postInstall
  '';

  meta = {
    description = "Pi provider extension that auto-registers CLIProxyAPI models, plus TUI elapsed/TPS status";
    homepage = "https://github.com/router-for-me/pi-cliproxyapi-provider";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

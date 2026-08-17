{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  makeWrapper,
  nodejs_24,
  llm-agents,
}:
buildNpmPackage {
  pname = "pi-acp";
  version = "0.0.33-unstable-2026-07-30";

  src = fetchFromGitHub {
    owner = "svkozak";
    repo = "pi-acp";
    rev = "d1cffc047ab37a096ee70ca39cfc1de463db8d12";
    hash = "sha256-y8QE91ZbRxzoaV8ITw95OqUEpsxkTI9eicygEF1GUFc=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-g7D7AYqGRC9NZns1K/Y0oyHs8RsLwjOWcn9It7rmrIk=";
  npmDepsFetcherVersion = 2;

  # tsup and typescript are devDependencies, so the install must NOT be
  # --omit=dev (that would break `npm run build` in buildPhase). The store
  # output stays clean anyway: npmInstallHook prunes devDeps with its own
  # `npm prune --omit=dev` before copying node_modules into $out.
  #
  # Skip the prepack lifecycle hook during `npm pack --dry-run`: upstream's
  # prepack re-runs `npm run build`, which is redundant after buildPhase.
  npmPackFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [ makeWrapper ];

  # pi-acp spawns `pi --mode rpc` resolved from PATH. Wrap the nix-managed pi
  # (llm-agents input) into the bin so the adapter works when an ACP client
  # (Zed et al.) launches it with a minimal environment. makeWrapper --prefix
  # prepends, so this flake-pinned pi (satisfies pi-acp's >= 0.80.4 minimum)
  # takes precedence over any pi found in the caller's PATH.
  postInstall = ''
    wrapProgram $out/bin/pi-acp \
      --prefix PATH : ${lib.makeBinPath [ llm-agents.pi ]}
  '';

  meta = {
    description = "Agent Client Protocol adapter bridging ACP clients to the pi coding agent";
    homepage = "https://github.com/svkozak/pi-acp";
    license = lib.licenses.mit;
    mainProgram = "pi-acp";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

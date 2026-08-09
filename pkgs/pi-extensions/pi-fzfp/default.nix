{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-fzfp";
  version = "0-unstable-2026-06-19";

  src = fetchFromGitHub {
    owner = "burneikis";
    repo = "pi-fzfp";
    rev = "00d0190e69544c5f0008178df38376f318eb2978";
    hash = "sha256-3Dq0VwaR2EdXH5YkGnk0LEqahqwDNeZrMQA310Y/b4Y=";
  };

  dontBuild = true;

  # pi-fzfp ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi loads
  # directly, and its package.json declares NO `dependencies` at all — only
  # peerDependencies (@earendil-works/pi-coding-agent, @earendil-works/pi-tui),
  # both of which pi injects at runtime. buildNpmPackage would therefore install
  # nothing, so a plain copy is sufficient and correct (mirrors pi-history /
  # pi-vcc / pi-autoresearch).
  #
  # At runtime it shells out to `fd` and `fzf`, discovered via a pure-filesystem
  # PATH walk. Those binaries are provided globally by home/programs/tools.nix
  # (fd) and stylix.nix (fzf.enable) — intentionally NOT duplicated in pi's
  # extraPackages. If absent, pi-fzfp silently delegates to the built-in provider.
  #
  # Upstream's `files` field spells out the runtime set; provider.test.ts and
  # package-lock.json are dev-only. The install path matches pi's piPackageRoot
  # helper, which resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-fzfp
    mkdir -p "$packageRoot"
    cp package.json index.ts provider.ts README.md LICENSE "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Fuzzy file picker for pi — fzf-powered @file autocomplete";
    homepage = "https://github.com/burneikis/pi-fzfp";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

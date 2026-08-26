{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-vcc";
  version = "0.7.0-unstable-2026-08-26";

  src = fetchFromGitHub {
    owner = "sting8k";
    repo = "pi-vcc";
    rev = "f7b80bbbe22315acf9f7925c0c3be2d4ae9feee5";
    hash = "sha256-7JJ6NB6gdvWBZKhRmdh6uVKEaGfmjyQW6gwLOZKUz6A=";
  };

  dontBuild = true;

  # pi-vcc ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi loads
  # directly. Its package.json declares NO `dependencies` at all — only
  # peerDependencies (@earendil-works/pi-coding-agent, typebox), both of which
  # pi injects at runtime (see the "Available Imports" table in pi's
  # docs/extensions.md). buildNpmPackage would therefore install nothing, so a
  # plain copy is sufficient and correct (mirrors pi-history / pi-autoresearch).
  #
  # Upstream declares no `files` field, so the runtime set is spelled out here:
  # tests/, benchmarks/ and scripts/ are dev-only, and demo.gif is a 16MB
  # README asset. The install path matches pi's piPackageRoot helper, which
  # resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-vcc
    mkdir -p "$packageRoot"
    cp package.json index.ts README.md CHANGELOG.md "$packageRoot/"
    cp -r src "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Algorithmic conversation compactor for pi — transcript-preserving structured summaries, no LLM calls";
    homepage = "https://github.com/sting8k/pi-vcc";
    # Upstream ships no LICENSE file; README.md states MIT.
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

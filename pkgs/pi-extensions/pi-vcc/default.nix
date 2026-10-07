{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-vcc";
  version = "0.10.0-unstable-2026-10-07";

  src = fetchFromGitHub {
    owner = "sting8k";
    repo = "pi-vcc";
    rev = "4cfc6bfae5a1a943dd2b4e9cabc95101bb5811bb";
    hash = "sha256-6brmvjWCa6s2DtZLonfiZvT9fhSTt2WzchkR7iQJK3U=";
  };

  dontBuild = true;

  # pi-vcc ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi loads
  # directly. Its package.json declares NO `dependencies` at all — only
  # peerDependencies (@earendil-works/pi-coding-agent, typebox), both of which
  # pi injects at runtime (see the "Available Imports" table in pi's
  # docs/extensions.md). buildNpmPackage would therefore install nothing, so a
  # plain copy is sufficient and correct (mirrors pi-autoresearch).
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

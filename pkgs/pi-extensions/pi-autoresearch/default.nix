{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-autoresearch";
  version = "1.9.0-unstable-2026-10-07";

  src = fetchFromGitHub {
    owner = "davebcn87";
    repo = "pi-autoresearch";
    rev = "04b8a50dac7efe80ffc91648bd00ed9b022e24c2";
    hash = "sha256-1Pc5pTjWOt00QDu/lRmhSJrpolzBAy5PiFDmGItZY8Y=";
  };

  dontBuild = true;

  # pi-autoresearch ships raw TypeScript (pi.extensions = ["./extensions"])
  # that pi loads directly, plus bundled skills (pi.skills = ["./skills"]) and
  # an assets/ dir read at runtime by /autoresearch export. Its package.json
  # has ONLY peerDependencies (@earendil-works/*, @sinclair/typebox) and
  # devDependencies — zero runtime dependencies. Pi injects the peers at
  # runtime, so there is nothing to install and no build step: a plain copy of
  # the files upstream declares in its `files` field is sufficient and correct
  # (mirrors pi-vcc). The install path matches pi's piPackageRoot helper,
  # which resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-autoresearch
    mkdir -p "$packageRoot"
    cp package.json README.md CHANGELOG.md LICENSE "$packageRoot/"
    cp -r extensions skills assets "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Autonomous experiment loop for pi — run, measure, keep or discard";
    homepage = "https://github.com/davebcn87/pi-autoresearch";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

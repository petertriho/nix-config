{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-vim";
  version = "0-unstable-2026-09-01";

  src = fetchFromGitHub {
    owner = "burneikis";
    repo = "pi-vim";
    rev = "0d0fd9d823f29bfa421d877def5cb5c7cf7e36a0";
    hash = "sha256-cKFISeQYIk6RS0MMIK4gr46GZKzLSPL6BZLlErCsAcc=";
  };

  dontBuild = true;

  # pi-vim ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi loads
  # directly. Its package.json declares NO `dependencies` — only peerDependencies
  # (@mariozechner/pi-coding-agent, @mariozechner/pi-tui), optionalDependencies
  # (@burneikis/pi-fzfp), and devDependencies (tsx, @types/node). pi injects the
  # peer deps at runtime (the installed pi ships @mariozechner/* in its
  # node_modules), the optional dep is coordinated via pi.events not npm
  # resolution, and dev deps are test-only. buildNpmPackage would therefore
  # install nothing, so a plain copy is sufficient and correct (mirrors pi-history
  # / pi-vcc / pi-autoresearch).
  #
  # Upstream's `files` field spells out the runtime set; test/ and
  # package-lock.json are dev-only. The install path matches pi's piPackageRoot
  # helper, which resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-vim
    mkdir -p "$packageRoot"
    cp package.json index.ts cursor.ts keys.ts motions.ts operators.ts \
       registers.ts repeat.ts search.ts state.ts text-objects.ts vim-editor.ts \
       README.md LICENSE "$packageRoot/"
    cp -r modes "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Vim motions extension for pi — normal, insert, visual, and replace modes with operators, motions, text objects, registers, search, and repeat";
    homepage = "https://github.com/burneikis/pi-vim";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

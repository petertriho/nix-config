{
  lib,
  stdenvNoCC,
  src,
  version,
}:
stdenvNoCC.mkDerivation {
  pname = "rpiv-args";
  inherit version src;

  # Raw .ts, no build. Peer @earendil-works/pi-coding-agent is injected by Pi at
  # runtime. sourceRoot stays the monorepo root; installPhase addresses the
  # packages/rpiv-args subdir explicitly.
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    packageRoot=$out/lib/node_modules/rpiv-args
    mkdir -p "$packageRoot"
    cp -r packages/rpiv-args/. "$packageRoot/"
    find "$packageRoot" -name "*.test.ts" -delete
    rm -rf "$packageRoot/node_modules"
    runHook postInstall
  '';

  meta = {
    description = "Shell-style \$1 / \$ARGUMENTS placeholders and !\`cmd\` substitution for Pi skills";
    homepage = "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-args";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

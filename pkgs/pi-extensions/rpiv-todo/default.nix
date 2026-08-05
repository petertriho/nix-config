{
  lib,
  stdenvNoCC,
  src,
  version,
  typebox,
}:
stdenvNoCC.mkDerivation {
  pname = "rpiv-todo";
  inherit version src;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/rpiv-todo
    mkdir -p "$packageRoot"

    cp -r packages/rpiv-todo/. "$packageRoot/"
    find "$packageRoot" -name "*.test.ts" -delete
    rm -rf "$packageRoot/node_modules"

    mkdir -p "$packageRoot/node_modules/@juicesharp"

    # Runtime dep: sibling rpiv-config (raw .ts from the same monorepo).
    cp -r packages/rpiv-config/. "$packageRoot/node_modules/@juicesharp/rpiv-config/"
    find "$packageRoot/node_modules/@juicesharp/rpiv-config" -name "*.test.ts" -delete

    # Runtime dep: typebox (prebuilt; only real dep of rpiv-config). External
    # @earendil-works/* peers are injected by Pi at runtime, not installed here.
    tar -xzf ${typebox} -C "$packageRoot/node_modules/"
    mv "$packageRoot/node_modules/package" "$packageRoot/node_modules/typebox"

    runHook postInstall
  '';

  meta = {
    description = "Live todo overlay for Pi that survives /reload and compaction";
    homepage = "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

{
  lib,
  stdenvNoCC,
  jq,
  src,
  version,
}:
stdenvNoCC.mkDerivation {
  pname = "rpiv-ask-user-question";
  inherit version src;

  nativeBuildInputs = [ jq ];
  dontConfigure = true;
  dontBuild = true;

  # Pi supplies TypeBox, including typebox/value used by rpiv-config.
  postPatch = ''
    for manifest in packages/{rpiv-ask-user-question,rpiv-config}/package.json; do
      jq 'del(.dependencies.typebox) | .peerDependencies.typebox = "*"' \
        "$manifest" > "$manifest.tmp"
      mv "$manifest.tmp" "$manifest"
    done
  '';

  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/rpiv-ask-user-question
    mkdir -p "$packageRoot"

    cp -r packages/rpiv-ask-user-question/. "$packageRoot/"
    find "$packageRoot" -name "*.test.ts" -delete
    rm -rf "$packageRoot/node_modules"

    mkdir -p "$packageRoot/node_modules/@juicesharp"

    # Runtime dep: sibling rpiv-config (raw .ts from the same monorepo).
    cp -r packages/rpiv-config/. "$packageRoot/node_modules/@juicesharp/rpiv-config/"
    find "$packageRoot/node_modules/@juicesharp/rpiv-config" -name "*.test.ts" -delete

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    packageRoot=$out/lib/node_modules/rpiv-ask-user-question
    for manifest in "$packageRoot/package.json" \
      "$packageRoot/node_modules/@juicesharp/rpiv-config/package.json"; do
      jq -e '
        ((.dependencies // {}) | has("typebox") | not)
        and (.peerDependencies.typebox == "*")
      ' "$manifest" > /dev/null
    done
    test -f "$packageRoot/index.ts"
    test -z "$(find "$packageRoot" -path '*/node_modules/typebox' -print -quit)"

    runHook postInstallCheck
  '';

  meta = {
    description = "Structured questionnaire the model can put to the user instead of guessing";
    homepage = "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

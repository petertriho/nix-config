{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  jq,
  runtimeShell,
}:
buildNpmPackage (finalAttrs: {
  pname = "vicinae-bitwarden";
  version = "0-unstable-2026-10-13";

  # Keep the store provider ID stable so preferences and shortcuts survive updates.
  name = "store.vicinae.bitwarden";

  src = fetchFromGitHub {
    owner = "vicinaehq";
    repo = "extensions";
    rev = "0e3953058fb787d2a96e5ac0cec462440c07cd07";
    hash = "sha256-kc51qTJKEnSiiN4mAkoXHkjq8In28rPHbW4+Hm9CLWY=";
  };

  sourceRoot = "${finalAttrs.src.name}/extensions/bitwarden";
  npmDepsHash = "sha256-08AigyP59EeO5lKymNp/ANzsczs9RkRY4kFOS8CKq24=";

  buildPhase = ''
    runHook preBuild
    npm run build -- --out="$out"
    runHook postBuild
  '';

  dontNpmInstall = true;

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    substituteInPlace test/rbw.test.cjs \
      --replace-fail '#!/bin/sh' '#!${runtimeShell}'
    npm test
    runHook postCheck
  '';

  doInstallCheck = true;
  nativeInstallCheckInputs = [ jq ];
  installCheckPhase = ''
    runHook preInstallCheck
    jq -e '.name == "bitwarden" and any(.commands[]; .name == "browse-vault")' \
      "$out/package.json" > /dev/null
    test -s "$out/browse-vault.js"
    test -s "$out/assets/extension_icon.png"
    runHook postInstallCheck
  '';

  meta = {
    description = "Search, copy and paste Bitwarden credentials in Vicinae using rbw";
    homepage = "https://github.com/vicinaehq/extensions/tree/main/extensions/bitwarden";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
})

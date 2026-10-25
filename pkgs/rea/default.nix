{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_26,
  jq,
  autoPatchelfHook,
  procps,
  runCommand,
}:
buildNpmPackage (finalAttrs: {
  pname = "rea";
  version = "experiment/atomic-codemode-wait-runtime-20261016-unstable-2026-10-25";

  src = fetchFromGitHub {
    owner = "morluto";
    repo = "rea";
    rev = "42c16ba6315a7a6ba52a06e74a20eb1671eaab21";
    hash = "sha256-9BmxKZDRLy8k9yl+f0JW1SYbeT0FQNgcIOHCAM/hLiE=";
  };

  # Keep platform-specific optional packages for PTYs and build tools.
  # Only Frida needs an unsupported native download during installation.
  postPatch = ''
    ${lib.getExe jq} 'del(.optionalDependencies.frida)' package.json > package.json.tmp
    mv package.json.tmp package.json
    ${lib.getExe jq} 'del(
      .packages[""].optionalDependencies.frida,
      .packages["node_modules/frida"]
    )' package-lock.json > package-lock.json.tmp
    mv package-lock.json.tmp package-lock.json
  '';

  nodejs = nodejs_26;
  npmDepsHash = "sha256-Do+EkI9z7QetNJ6/yo4EbNPP+begXZg9349uzyGvIJM=";
  npmDepsFetcherVersion = 2;
  npmFlags = [ "--ignore-scripts" ];
  npmPackFlags = [ "--ignore-scripts" ];

  env = {
    HUSKY = "0";
    TURBO_TELEMETRY_DISABLED = "1";
    DO_NOT_TRACK = "1";
  };

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  # Build tools must work before fixup. Musl alternatives are not used.
  preBuild =
    lib.optionalString stdenv.hostPlatform.isLinux ''
      autoPatchelf \
        node_modules/@typescript \
        node_modules/@turbo \
        node_modules/@rolldown/*-gnu \
        node_modules/@tsrs/*-gnu \
        node_modules/@lydell
    ''
    + ''
      node scripts/check-dependency-install.mjs
    '';

  makeWrapperArgs = lib.optionals stdenv.hostPlatform.isLinux [
    "--prefix PATH : ${lib.makeBinPath [ procps ]}"
  ];

  postInstall = ''
    packageRoot="$out/lib/node_modules/rea-agents"
    # The upstream build generates only the user-facing skill.
    cp -R .agents/skills/rea-* "$packageRoot/skills/"
    find "$packageRoot/skills" -type f -name '*.md' \
      -exec sed -i -E 's/npx( -y)? rea-agents(@[[:alnum:].+_-]+)?/rea/g' {} +
    mkdir -p "$out/share/rea"
    ln -s "$packageRoot/skills" "$out/share/rea/skills"
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    "$out/bin/rea" --help > /dev/null
    "$out/bin/rea-agents" --version
    test -f "$out/lib/node_modules/rea-agents/dist/mcp/main.js"
    test -f "$out/share/rea/skills/reverse-engineer-anything/SKILL.md"
    test ! -d "$out/lib/node_modules/rea-agents/node_modules/frida"
    runHook postInstallCheck
  '';

  passthru.tests.smoke =
    runCommand "${finalAttrs.pname}-smoke-test"
      {
        nativeBuildInputs = [ finalAttrs.nodejs ];
      }
      ''
        node ${./smoke-test.mjs} \
          "${finalAttrs.finalPackage}/lib/node_modules/rea-agents" \
          "${lib.getExe finalAttrs.finalPackage}"
        touch "$out"
      '';

  meta = {
    description = "Reverse-engineering CLI and MCP server for agents";
    homepage = "https://github.com/morluto/rea";
    license = lib.licenses.mit;
    mainProgram = "rea";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];
    sourceProvenance = with lib.sourceTypes; [
      fromSource
      binaryNativeCode
    ];
  };
})

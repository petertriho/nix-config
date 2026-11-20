{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  jq,
  autoPatchelfHook,
  procps,
}:
buildNpmPackage {
  pname = "rea";
  version = "experiment/atomic-codemode-wait-runtime-20261016-unstable-2026-11-20";

  src = fetchFromGitHub {
    owner = "morluto";
    repo = "rea";
    rev = "8bb01b514ac766c0c3ecc8f362bd38186eaec9c2";
    hash = "sha256-2ulhZ2GXe1xOHKLNuJo9mTivy4OTiWP9VLHEXnpn5YI=";
  };

  # Keep platform-specific optional packages for PTYs and build tools.
  # Only Frida needs an unsupported native download during installation.
  # The npm dependency fetcher also runs this hook. A failure here also
  # blocks the npmDepsHash refresh, so keep this hook small.
  postPatch = ''
    ${lib.getExe jq} 'del(.optionalDependencies.frida)' package.json > package.json.tmp
    mv package.json.tmp package.json
    ${lib.getExe jq} 'del(
      .packages[""].optionalDependencies.frida,
      .packages["node_modules/frida"]
    )' package-lock.json > package-lock.json.tmp
    mv package-lock.json.tmp package-lock.json
  '';

  # Use the Node.js line that upstream pins in .nvmrc. The upstream build
  # scripts need TypeScript transform mode, which Node.js 26 removed.
  nodejs = nodejs_24;
  npmDepsHash = "sha256-w3YZ+KnfRdiOq8nsNgz9APD/3aXDGvvn1S38r/M0vuQ=";
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
}

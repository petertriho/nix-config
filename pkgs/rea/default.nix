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
  version = "experiment/atomic-codemode-wait-runtime-20261016-unstable-2026-11-08";

  src = fetchFromGitHub {
    owner = "morluto";
    repo = "rea";
    rev = "b81da90354e3ce4c1e01c5e5a06f4794f15f436a";
    hash = "sha256-ki8I6ftxx5i7oW+536ASVPvcYy4T8p6u7KHWZZew1H0=";
  };

  # Keep platform-specific optional packages for PTYs and build tools.
  # Only Frida needs an unsupported native download during installation.
  postPatch = ''
    # Node.js 26 removed transform mode. Keep enum and parameter-property
    # support through the existing TypeScript 6 build dependency.
    substituteInPlace scripts/lib/verifier-source-loader.mjs \
      --replace-fail 'import * as nodeModule from "node:module";' \
        'import * as nodeModule from "node:module";
    import ts from "typescript6";' \
      --replace-fail 'nodeModule.stripTypeScriptTypes(source, {
          mode: "transform",
          sourceMap: true,
          sourceUrl: url,
        })' 'ts.transpileModule(source, {
          fileName: path,
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: format === "commonjs" ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
            inlineSourceMap: true,
            inlineSources: true,
          },
        }).outputText' \
      --replace-fail 'typeof nodeModule.stripTypeScriptTypes' 'typeof ts.transpileModule'

    ${lib.getExe jq} 'del(.optionalDependencies.frida)' package.json > package.json.tmp
    mv package.json.tmp package.json
    ${lib.getExe jq} 'del(
      .packages[""].optionalDependencies.frida,
      .packages["node_modules/frida"]
    )' package-lock.json > package-lock.json.tmp
    mv package-lock.json.tmp package-lock.json
  '';

  nodejs = nodejs_26;
  npmDepsHash = "sha256-ASOy60xl1oQg1yk02qsCnCUlY0eabLbP32f0/5aT1so=";
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

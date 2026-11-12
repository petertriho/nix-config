{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bun,
  writableTmpDirAsHomeHook,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "impeccable";
  version = "skill-v4.8.2-unstable-2026-11-11";

  src = fetchFromGitHub {
    owner = "pbakaus";
    repo = "impeccable";
    rev = "b4bff1626c344067788c2679f048a20057c7cc5a";
    hash = "sha256-auqflH7kEUZzF0EftJLOZeJe1Lvvy8PeaIgSG/j8y5U=";
  };

  nativeBuildInputs = [
    bun
    writableTmpDirAsHomeHook
  ];

  postPatch = ''
    substituteInPlace scripts/lib/zip.js \
        --replace-fail "import { ZipArchive } from 'archiver';" ""

    substituteInPlace scripts/build.js \
        --replace-fail "await createAllZips(DIST_DIR);" "console.log('Skipping ZIP bundle creation for Nix package');"

    substituteInPlace scripts/build.js \
        --replace-fail "await createProviderZip(openAiPluginRoot, DIST_DIR, 'openai-plugin');" "console.log('Skipping OpenAI plugin ZIP creation for Nix package');"
  '';

  dontConfigure = true;

  buildPhase = ''
    runHook preBuild

    bun run build:skills

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d $out/share/impeccable
    cp -r dist $out/share/impeccable/

    runHook postInstall
  '';

  meta = {
    description = "Cross-provider design skills and commands for LLM-powered development tools";
    homepage = "https://github.com/pbakaus/impeccable";
    license = lib.licenses.asl20;
    maintainers = [ ];
    platforms = bun.meta.platforms;
  };
})

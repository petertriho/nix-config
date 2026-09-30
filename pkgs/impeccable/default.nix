{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bun,
  writableTmpDirAsHomeHook,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "impeccable";
  version = "skill-v4.3.1-unstable-2026-09-30";

  src = fetchFromGitHub {
    owner = "pbakaus";
    repo = "impeccable";
    rev = "0d6b47ea19b63afe15e3f93a44d5d9fbbc6fd275";
    hash = "sha256-zZa/J/6aNNebOo7EQUXXJ7mHO8mHo0CGNOlcdKA6H1M=";
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

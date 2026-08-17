{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  bun,
  writableTmpDirAsHomeHook,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "impeccable";
  version = "skill-v4.1.1-unstable-2026-08-16";

  src = fetchFromGitHub {
    owner = "pbakaus";
    repo = "impeccable";
    rev = "5c5553b1d7f9e89bb833f9179cea681742a17720";
    hash = "sha256-V7fHUjw0tFn8X5daS9Wjy6BusFMkF6+K6ADzeUeNpYA=";
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

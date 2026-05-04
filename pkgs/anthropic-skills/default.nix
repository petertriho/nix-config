{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-05-03";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "d230a6dd6eb1a0dbee9fec55e2f00a96e28dff81";
    sha256 = "sha256-6GyoLtVWna20TrLg7Y2R6wCWD6C4GbDtIB0jbl5VESY=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/anthropic-skills
    cp -r . $out/share/anthropic-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Anthropic skills repository";
    homepage = "https://github.com/anthropics/skills";
    license = licenses.mit;
    maintainers = [ ];
  };
}

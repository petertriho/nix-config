{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "unstable-2026-04-16";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "0f7c287eaf0d4fa511cb871bb55e2a7862251fbb";
    sha256 = "10lis7l2iziqibzziljzq65qac6jh0fb4gacz424rfqrwx8fmz1g";
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

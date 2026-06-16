{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "last30days-skill";
  version = "3.3.0-unstable-2026-06-16";

  src = fetchFromGitHub {
    owner = "mvanhorn";
    repo = "last30days-skill";
    rev = "ad7d1bf9283af91407ec32eb5d4ca71f07e98b36";
    hash = "sha256-wSc+0NoUIJ/NCsiN6OTisNEvoZR7FxMOxuBNWtJu+T4=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/last30days-skill
    cp -r . $out/share/last30days-skill/

    runHook postInstall
  '';

  meta = with lib; {
    description = "AI agent-led search skill for researching the last 30 days";
    homepage = "https://github.com/mvanhorn/last30days-skill";
    license = licenses.mit;
    maintainers = [ ];
  };
}

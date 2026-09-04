{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "0-unstable-2026-09-03";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f";
    sha256 = "sha256-sjgPv9tZZVTXPxZWaCOc7JwFceNn3C1ghy8mSHqgqB8=";
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

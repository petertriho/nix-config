{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-05-31";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "aaf2453fbdfe7a15c07f11d861224f34ab4b53cb";
    sha256 = "sha256-+Px3qIMHGKvi0PK2l5H4j/4YRQ448G9kuWX28cgqPCI=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/mattpocock-skills
    cp -r . $out/share/mattpocock-skills/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Matt Pocock skills repository";
    homepage = "https://github.com/mattpocock/skills";
    maintainers = [ ];
  };
}

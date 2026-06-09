{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "mattpocock-skills";
  version = "0-unstable-2026-06-08";

  src = fetchFromGitHub {
    owner = "mattpocock";
    repo = "skills";
    rev = "2bf70051928429983de3b5718d277150926f8c89";
    sha256 = "sha256-v8gOB1tvmytemH05C0j+WjwdfzaDgXg+MnKk5mDSblY=";
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

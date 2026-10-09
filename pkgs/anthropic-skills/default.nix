{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "anthropic-skills";
  version = "unstable-2026-10-05";

  src = fetchFromGitHub {
    owner = "anthropics";
    repo = "skills";
    rev = "683bc88e56f3e09ba94f7055977f3d3aa499f202";
    sha256 = "0bnl4l8xzw09pml1cjqcnabb51y8nbcbccg4kq5zjimaqb23xz00";
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

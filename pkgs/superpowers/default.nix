{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "unstable-2026-03-05";

  src = fetchFromGitHub {
    owner = "petertriho";
    repo = "superpowers";
    rev = "b89305c82776a5066587fee6ae4e070588abd14a";
    sha256 = "sha256-2iWHwJi15lelh1/bg7aLVBynIWq8LdNdapXxfrbYZes=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/superpowers
    cp -r . $out/share/superpowers/

    runHook postInstall
  '';

  meta = with lib; {
    description = "Agentic skills framework and software development methodology";
    homepage = "https://github.com/obra/superpowers";
    license = licenses.mit;
    maintainers = [ ];
  };
}

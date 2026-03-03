{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
}:
stdenvNoCC.mkDerivation {
  pname = "superpowers";
  version = "unstable-2026-02-21";

  src = fetchFromGitHub {
    owner = "obra";
    repo = "superpowers";
    rev = "e4a2375cb705ca5800f0833528ce36a3faf9017a";
    sha256 = "1w7iymi0ix7rfrb47acds9d1dcbn1ggsj418l1s1ln8zs2sh5qh1";
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

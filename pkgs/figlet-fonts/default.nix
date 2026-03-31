{
  lib,
  stdenv,
  fetchFromGitHub,
}:

stdenv.mkDerivation {
  pname = "figlet-fonts";
  version = "0-unstable-2026-03-30";

  src = fetchFromGitHub {
    owner = "xero";
    repo = "figlet-fonts";
    rev = "417429ef36ab039cbf192a4424c60aa23fc32de8";
    sha256 = "sha256-QogGNQ772bcYLOzgO0i6ydbzxjn5jnXNav72vW/SXm8=";
  };

  installPhase = ''
    runHook preInstall

    install -d $out/share/figlet
    cp *.flf $out/share/figlet/
    cp *.tlf $out/share/figlet/ || true

    runHook postInstall
  '';

  meta = with lib; {
    description = "A collection of FIGlet fonts";
    homepage = "https://github.com/xero/figlet-fonts";
    license = licenses.gpl2;
    maintainers = [ ];
  };
}

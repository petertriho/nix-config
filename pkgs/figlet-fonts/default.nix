{
  lib,
  stdenv,
  fetchFromGitHub,
}:

stdenv.mkDerivation {
  pname = "figlet-fonts";
  version = "unstable-2023-01-01";

  src = fetchFromGitHub {
    owner = "xero";
    repo = "figlet-fonts";
    rev = "5c250192890856486be8a85085e7915b1b655f3e";
    sha256 = "0kaxpq2ap4nm5rp7y9jcwgqi3kayq6miv23d0an4dydpry646gf1";
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

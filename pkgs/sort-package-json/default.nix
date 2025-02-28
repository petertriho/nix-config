{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-02-28";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "d7db51c6160ab10b1347cfc4427179263d2e4165";
    sha256 = "1dwq14wq6zk136nz1f8viaxgzg4wafl149nzqqy2w5zcgjfcypcq";
  };
  npmDepsHash = "sha256-9wd2eVEtRiTq0+ZJ68qDMfe5KWVGlicKM7egEamHR4s=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-07-02";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "a03895650fb6fe155af6c2c03491de9bc492fdab";
    sha256 = "0sijfnh4962iy4cjgq1bxy7ma2d8adr3rcpwgr0wp2hhi6x1cwqa";
  };
  npmDepsHash = "sha256-9a/aeaP+1gljThN5w2NWizri6Vjcabv8Y0XdMOTr6sY=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

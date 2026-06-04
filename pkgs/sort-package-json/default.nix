{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "4.0.0-unstable-2026-06-03";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "d51292ca3b0ec8515e6c49bf1ce08bcf3601876d";
    sha256 = "sha256-uoZqILgsg/aaMA2/tRmUZrM96JkaYp/ga2Xdi03UquU=";
  };
  npmDepsHash = "sha256-YqQXrWUi9+Gf8Ni2qcFy/cl3OOsI255/gt0tMDhqpko=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.7.0-unstable-2026-06-02";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "0f2dc7ae10bd1be80b9f0f0fe6801e8edd8f72ee";
    sha256 = "sha256-uoZqILgsg/aaMA2/tRmUZrM96JkaYp/ga2Xdi03UquU=";
  };
  npmDepsHash = "sha256-YqQXrWUi9+Gf8Ni2qcFy/cl3OOsI255/gt0tMDhqpko=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

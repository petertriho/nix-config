{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "4.1.0-unstable-2026-10-15";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "47692f6be9a30c46423b3c09c7038a32c65e9b6d";
    sha256 = "sha256-dqk0BypmVx23FTaTvq46MxAI+Tr0Q66xR4srwpi4Kfs=";
  };
  npmDepsHash = "sha256-YqQXrWUi9+Gf8Ni2qcFy/cl3OOsI255/gt0tMDhqpko=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

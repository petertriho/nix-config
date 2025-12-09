{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.5.1-unstable-2025-12-08";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "e6052c441417f4db34abbb0352431240901d3b6d";
    sha256 = "sha256-7sUHrMjBwR1VVgwWmTqdKiqlMd+ZbFqqwoPWNVmzVfI=";
  };
  npmDepsHash = "sha256-dECVKQE7AwAZERSmFhv9qXG+zCSXxSxKBqX/mtFFXFs=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

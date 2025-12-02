{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.5.0-unstable-2025-12-01";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "c3bf18acae57d3fef1c4b3f442b004ed82658401";
    sha256 = "sha256-SBzRgN11En7GTLeJ/amoDK18G9SXSjLXZYoshuu3neY=";
  };
  npmDepsHash = "sha256-dECVKQE7AwAZERSmFhv9qXG+zCSXxSxKBqX/mtFFXFs=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

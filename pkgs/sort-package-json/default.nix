{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "4.1.0-unstable-2026-10-22";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "c09b95d1ae966a38e5036287d23629641f86d33e";
    sha256 = "sha256-ke2lVbLufufTztIidwg5F3NnPG2yZM0T1uZSiMbm2dc=";
  };
  npmDepsHash = "sha256-6EXgFwaULC8Y8gZ0+zN02o1IXIHjxIU4izqyLYEfp4E=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

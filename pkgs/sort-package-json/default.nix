{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.6.0-unstable-2025-12-14";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "e3f2370982fdd22fbf6d68ab8c9690f3a767f834";
    sha256 = "1z4p06vaijjgma45ngqyvkrl1z9km4dnf4cp5f5gspd443wdlz33";
  };
  npmDepsHash = "sha256-dECVKQE7AwAZERSmFhv9qXG+zCSXxSxKBqX/mtFFXFs=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

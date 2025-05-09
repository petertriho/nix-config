{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-05-08";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "aa6774ad937feb83178c8bc981f08305e1d22b5c";
    sha256 = "0wspgbz27qkipc707x3m4a6xkzc46ppmrfrvfq1xfl8y4049qx9i";
  };
  npmDepsHash = "sha256-vPizvY1Wuv1svGiWwQeqUI3UYdu/F4X0vQGdJIyHU0Q=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

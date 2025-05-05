{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-05-04";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "27e4b7bf4d1357c43c147861b76fcf0f79c661d5";
    sha256 = "1r5qwz80z895lm5wp3n6hl9vkkbpr6c3zmqfchrrq5sx62b4wdbq";
  };
  npmDepsHash = "sha256-vPizvY1Wuv1svGiWwQeqUI3UYdu/F4X0vQGdJIyHU0Q=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

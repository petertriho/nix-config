{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.6.1-unstable-2026-01-30";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "7622c1a501c01b398d2ed367f1389a59c8b98997";
    sha256 = "sha256-Xrd4BIKpajwFYlJiXLDZtKGiW14m0JTs7ATe6RcdUXk=";
  };
  npmDepsHash = "sha256-dECVKQE7AwAZERSmFhv9qXG+zCSXxSxKBqX/mtFFXFs=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

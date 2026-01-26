{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.6.1-unstable-2026-01-25";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "15e11409336204a1a1ecb1a15b808473395eb244";
    sha256 = "sha256-PGstuD9NNdY8dkrtLLZjGbUJ7fb4U5mPSFygnZcGi9k=";
  };
  npmDepsHash = "sha256-dECVKQE7AwAZERSmFhv9qXG+zCSXxSxKBqX/mtFFXFs=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

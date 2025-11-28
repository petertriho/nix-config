{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.5.0-unstable-2025-11-27";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "d157f64858b2344c4ac43ae700b2ec324d27fd09";
    sha256 = "sha256-VTe/KvpK63SvqHcL4GNof8yoKrOjt+ruePqsXkj5cjA=";
  };
  npmDepsHash = "sha256-plNHZ7HQqEGXogRQc609SgMIrKNlKRD4B14e5ByaY0M=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

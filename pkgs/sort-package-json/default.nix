{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-01-13";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "eb492983e9b70f2ff5f02e3189833df60c03c076";
    sha256 = "1mh38k2gjnvbi3bwsfwhhc2ygs9krjdc5ija9mhq3waqr0ma727w";
  };
  npmDepsHash = "sha256-x+k3ocdyMxhkUr/EiAO/u9sYRE0tYtGqtrAS56zwjqw=";
  dontNpmBuild = true;
}

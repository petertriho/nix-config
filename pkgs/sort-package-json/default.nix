{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2024-11-23";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "0bf1155077882cf49c5664d4be65a570c30fc20a";
    sha256 = "1mgcg3fgnxvcrirm52w5ys6rca3nxsxr4nawbb5c67r7k5bcgylc";
  };
  npmDepsHash = "sha256-x+k3ocdyMxhkUr/EiAO/u9sYRE0tYtGqtrAS56zwjqw=";
  dontNpmBuild = true;
}

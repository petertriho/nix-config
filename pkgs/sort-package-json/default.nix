{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2024-11-19";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "57aebe2b068e6c3f9ba906c1ee88e03b20f2707e";
    sha256 = "1yggrb4dwcvn2j0i3gq1bkx07jvny8z0rdisj1chpw160pmngm63";
  };
  npmDepsHash = "sha256-x+k3ocdyMxhkUr/EiAO/u9sYRE0tYtGqtrAS56zwjqw=";
  dontNpmBuild = true;
}

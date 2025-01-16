{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-01-15";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "703badf57c4ed9f7b4574371796e5c52a7f3f4ad";
    sha256 = "0pq4296i2cc9clfjxl5m9wnz25rjnq0iakfa0rir1b1dc2w7zy6r";
  };
  npmDepsHash = "sha256-x+k3ocdyMxhkUr/EiAO/u9sYRE0tYtGqtrAS56zwjqw=";
  dontNpmBuild = true;
}

{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2024-10-16";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "99a976083da59a1c1e8237b8a00794ecaaace49f";
    sha256 = "11r84120k536nibf7xzcliqc3s3m5qrza8kkkxkb77vaf9d48gkn";
  };
  npmDepsHash = "sha256-9d2AN5vM6FRTFpRil+YHz7NZY5gzIBpSorykctc6zpI=";
  dontNpmBuild = true;
}

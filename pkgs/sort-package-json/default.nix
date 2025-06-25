{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-06-25";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "7dc1dfdfc951870a7e6d64549808262075869673";
    sha256 = "18wdicpgkxnrym2bz4ari687mxxx8aa43pg58bv74h56z3n0lmm7";
  };
  npmDepsHash = "sha256-9a/aeaP+1gljThN5w2NWizri6Vjcabv8Y0XdMOTr6sY=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

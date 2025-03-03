{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-03-01";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "43ee7e7f613d113e0621d78195158cfe1dd9df1f";
    sha256 = "15rkgnvbng4xaq7a90k4ckwkwwn9jwx2a4dwss092k4lg3jgzvds";
  };
  npmDepsHash = "sha256-MXVfDaUQN70xWLrf3UhbPwgfCdetP9v1Gw/7RYG2RQ0";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

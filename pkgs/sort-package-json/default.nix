{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.6.1-unstable-2026-04-28";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "94c39049cf818ca404a17c44a4a7fa8eb7abb087";
    sha256 = "sha256-0O72r7o9bfy6Tr3Df0TcgEsL0ZfVYtbv6yt1PAltpAA=";
  };
  npmDepsHash = "sha256-YqQXrWUi9+Gf8Ni2qcFy/cl3OOsI255/gt0tMDhqpko=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

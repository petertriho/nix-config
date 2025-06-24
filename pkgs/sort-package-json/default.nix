{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-06-23";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "41673dbadf46343ddf29ed71f44a4f39be4cf8f0";
    sha256 = "1i8m7hl95s0dg1qmzhz9wrwf26jclyyqx8xxsd4808a33g2d4pa9";
  };
  npmDepsHash = "sha256-KYyGkS6b+8ruUBbgs8PTZAA11MgwZK7Lsu6qV+KmOTE=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

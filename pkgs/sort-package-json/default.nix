{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-06-08";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "1c142c61f4cd370fc3b17f150927ed4d82efa6f3";
    sha256 = "14ijyxfd2vhi56ypnb0kgjw1ksjlh3ggwycrlc02yx6q90xgbz4q";
  };
  npmDepsHash = "sha256-KYyGkS6b+8ruUBbgs8PTZAA11MgwZK7Lsu6qV+KmOTE=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

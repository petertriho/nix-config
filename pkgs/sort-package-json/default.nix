{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2024-10-08";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "ae5ba5f6ec3de7bf3869800cf95b021994708936";
    sha256 = "0jybpka8d5az6v0k5az1nx4nb4ncmlk01cxp84fhy5vkmz1np7dw";
  };
  npmDepsHash = "sha256-SLRsgtAyPPHwrzAUZ9LQi+cV2Gyu0+XmZAhdq8/F3s8=";
  dontNpmBuild = true;
}

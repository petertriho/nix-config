{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2024-10-13";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "2611d16b354f0f0881ee8f4b66f138da4fd002e1";
    sha256 = "1kn6j5l41xp81n1r01c8v4vcizd3cjblkryz4cklzxs3h9sfca4p";
  };
  npmDepsHash = "sha256-SLRsgtAyPPHwrzAUZ9LQi+cV2Gyu0+XmZAhdq8/F3s8=";
  dontNpmBuild = true;
}

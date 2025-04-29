{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-04-29";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "9f1101b0dc82276c0b72052bac2117ae570b5be4";
    sha256 = "089z9hj18n9qvb6z8x2vmhwjc629qx5r1x3fi8inmxrxmz76zfjv";
  };
  npmDepsHash = "sha256-vPizvY1Wuv1svGiWwQeqUI3UYdu/F4X0vQGdJIyHU0Q=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

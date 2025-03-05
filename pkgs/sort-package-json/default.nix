{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-03-04";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "819cd97d787e81c7cb12a618bd07dc100c4bc9f8";
    sha256 = "0rj0d4gpwp0kiyxjgf3lk1q69cyssp5w0kjh206g4jwa2a68cwm4";
  };
  npmDepsHash = "sha256-vPizvY1Wuv1svGiWwQeqUI3UYdu/F4X0vQGdJIyHU0Q=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

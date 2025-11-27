{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "3.5.0-unstable-2025-11-26";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "358e586c1c708e06ee8223031abbc0c6f2a2681b";
    sha256 = "sha256-NhQurc48QJ4GPcV09DToVSAuGgWBSXROUJq2PdzsFT4=";
  };
  npmDepsHash = "sha256-plNHZ7HQqEGXogRQc609SgMIrKNlKRD4B14e5ByaY0M=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

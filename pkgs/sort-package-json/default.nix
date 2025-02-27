{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-02-26";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "e9ab5c61294ee174a1cbd78bc6dffc235c47c8e4";
    sha256 = "0nf2hhwp70wmabqaibg36l7khz7sm9i9f0x8nlqmgnp7va0lsw9l";
  };
  npmDepsHash = "sha256-9wd2eVEtRiTq0+ZJ68qDMfe5KWVGlicKM7egEamHR4s=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

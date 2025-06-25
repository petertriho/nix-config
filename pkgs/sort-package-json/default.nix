{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-06-24";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "7d1dd6284fa8f9a0136608a2bda9e47b380448c3";
    sha256 = "0xgrd559n3kxiy3nwszhmmd54528j4d98zr6j813lvr90x68haji";
  };
  npmDepsHash = "sha256-9a/aeaP+1gljThN5w2NWizri6Vjcabv8Y0XdMOTr6sY=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

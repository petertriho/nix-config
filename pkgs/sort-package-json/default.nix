{
  buildNpmPackage,
  fetchFromGitHub,
}:
buildNpmPackage {
  pname = "sort-package-json";
  version = "unstable-2025-02-10";
  src = fetchFromGitHub {
    owner = "keithamus";
    repo = "sort-package-json";
    rev = "5e388ef4422ff8abdb7fa646e8915ad56264ce39";
    sha256 = "07p4h86my3m581825q1r4671ap7sy9dg8pp6c9dmjrzsf9rj6n45";
  };
  npmDepsHash = "sha256-9wd2eVEtRiTq0+ZJ68qDMfe5KWVGlicKM7egEamHR4s=";
  dontNpmBuild = true;
  postInstall = ''
    find -L $out -type l -print -delete
  '';
}

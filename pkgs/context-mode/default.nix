{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.166-unstable-2026-06-23";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "d75b5a7f777b34d19db7ccd2d13ebff85be4e706";
    hash = "sha256-bROxzp5haWJxhhGoJNKCJ+v1jEs3MoNJ5VQPCD4xIYM=";
  };

  inherit nodejs;

  npmDepsHash = "sha256-HVbW9rqOnrMo8qyVAEQDEAOjUtbETc3uTl7u9UjRDqU=";

  postPatch = ''
    cp ${./package-lock.json} package-lock.json
    node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));delete pkg.scripts.postinstall;fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n')"
  '';

  meta = with lib; {
    description = "Context window optimization for AI coding agents";
    homepage = "https://github.com/mksglu/context-mode";
    license = licenses.elastic20;
    mainProgram = "context-mode";
    maintainers = [ ];
  };
}

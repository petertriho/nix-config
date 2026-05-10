{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
}:

buildNpmPackage {
  pname = "opencode-multi-auth";
  version = "0-unstable-2026-04-28";

  src = fetchFromGitHub {
    owner = "floze-the-genius";
    repo = "opencode-multi-auth-codex";
    rev = "75ecf44a7d014e078691bd6a7cba27b10e6c246f";
    hash = "sha256-5doWhXS0cvag0kEGT4kwEQLAxKfE1hu3l5dAZsjRXg4=";
  };

  npmDepsHash = "sha256-tO2Ml5PhJFLTkNkf8I+1fIMtja5ZffgmGdR1OKK5tPk=";

  npmBuildScript = "build";

  meta = with lib; {
    description = "Multi-account OAuth rotation CLI for OpenCode Codex accounts";
    homepage = "https://github.com/floze-the-genius/opencode-multi-auth-codex";
    license = licenses.mit;
    mainProgram = "opencode-multi-auth";
    maintainers = [ ];
  };
}

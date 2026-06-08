{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

with python3Packages;
buildPythonApplication rec {
  pname = "graphify";
  version = "0.8.35-unstable-2026-06-07";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "safishamsi";
    repo = "graphify";
    rev = "8a04560bf5d5eaeef8e466bce084270b7f68faae";
    hash = "sha256-/Vuwq+4QJdAL7dzYtt75X/2EGO1/PfRBmUYEG/J49do=";
  };

  build-system = [ setuptools ];

  dependencies = [
    datasketch
    networkx
    rapidfuzz
    tree-sitter
    tree-sitter-bash
    tree-sitter-c-sharp
    tree-sitter-javascript
    tree-sitter-json
    tree-sitter-python
    tree-sitter-rust
  ];

  doCheck = false;
  dontCheckRuntimeDeps = true;
  pythonImportsCheck = [ "graphify" ];

  meta = {
    description = "Turn code, docs, papers, images, or videos into a queryable knowledge graph";
    homepage = "https://github.com/safishamsi/graphify";
    license = lib.licenses.mit;
    mainProgram = "graphify";
  };
}

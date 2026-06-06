{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

with python3Packages;
buildPythonApplication rec {
  pname = "graphify";
  version = "0.8.32-unstable-2026-06-05";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "safishamsi";
    repo = "graphify";
    rev = "3405c1fb96c119fc928307d91fc6c190a7118e36";
    hash = "sha256-PAweiBa7r+BJPYr7rIdhCaDaItWa+A37wcsl0H773Nw=";
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

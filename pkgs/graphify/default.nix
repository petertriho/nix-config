{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

with python3Packages;
buildPythonApplication rec {
  pname = "graphify";
  version = "0.8.31-unstable-2026-06-03";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "safishamsi";
    repo = "graphify";
    rev = "863f0c1e9f079112e9f40d97f71ec8e3e5a4d5bf";
    hash = "sha256-DUkecXZblQPuP74Npb0T/bmhJag/2/SxgiF8ajOfQlk=";
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

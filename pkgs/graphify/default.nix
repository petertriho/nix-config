{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

with python3Packages;
buildPythonApplication rec {
  pname = "graphify";
  version = "0.8.33-unstable-2026-06-07";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "safishamsi";
    repo = "graphify";
    rev = "079b34da7851e6f7c7ae8347853c4dfd93f818ff";
    hash = "sha256-hVBbg2nkRYP0msmb564XskiGowKyAFm0Pmu+8Q7t+fs=";
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

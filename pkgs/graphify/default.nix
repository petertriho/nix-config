{
  lib,
  fetchFromGitHub,
  python3Packages,
}:

with python3Packages;
buildPythonApplication rec {
  pname = "graphify";
  version = "0.8.22";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "safishamsi";
    repo = "graphify";
    rev = "a1706ff7fdba2979b34a1518256ac1d826b2f22c";
    hash = "sha256-LKUnm2tAEjr5qj2WCfe2rNAmgIX1pm1Kr+3fCKVMzbU=";
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

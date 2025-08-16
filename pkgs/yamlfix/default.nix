{
  lib,
  fetchFromGitHub,
  python3Packages,
  ...
}:
python3Packages.buildPythonPackage rec {
  pname = "yamlfix";
  version = "1.16.1-unstable-2024-08-21";
  pyproject = true;

  disabled = python3Packages.pythonOlder "3.8";

  src = fetchFromGitHub {
    owner = "lyz-code";
    repo = "yamlfix";
    rev = "8072181c0f2eab9f2dd8db2eb3b9556d7cd0bd74";
    hash = "sha256-TNGFkaPSJKsEeNDA+UZyNE0jpGoePCy0J88oURkuhYQ=";
  };

  build-system = with python3Packages; [
    setuptools
    pdm-backend
  ];

  dependencies = with python3Packages; [
    click
    maison
    ruyaml
  ];

  nativeCheckInputs = with python3Packages; [
    pytest-freezegun
    pytest-xdist
    pytestCheckHook
  ];

  preCheck = ''
    export HOME=$(mktemp -d)
  '';

  pythonImportsCheck = [ "yamlfix" ];

  pytestFlagsArray = [
    "-W"
    "ignore::DeprecationWarning"
  ];

  meta = {
    description = "Python YAML formatter that keeps your comments";
    homepage = "https://github.com/lyz-code/yamlfix";
    changelog = "https://github.com/lyz-code/yamlfix/blob/${version}/CHANGELOG.md";
    license = lib.licenses.gpl3Only;
    maintainers = with lib.maintainers; [ koozz ];
  };
}

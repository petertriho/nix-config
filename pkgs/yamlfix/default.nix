{
  lib,
  buildPythonPackage,
  click,
  fetchFromGitHub,
  maison,
  pdm-backend,
  pytest-freezegun,
  pytest-xdist,
  pytestCheckHook,
  pythonOlder,
  ruyaml,
  setuptools,
}:
buildPythonPackage rec {
  pname = "yamlfix";
  version = "1.17.0";
  pyproject = true;

  disabled = pythonOlder "3.8";

  src = fetchFromGitHub {
    owner = "lyz-code";
    repo = "yamlfix";
    tag = version;
    hash = "sha256-TNGFkaPSJKsEeNDA+UZyNE0jpGoePCy0J88oURkuhYQ=";
  };

  build-system = [
    setuptools
    pdm-backend
  ];

  dependencies = [
    click
    maison
    ruyaml
  ];

  nativeCheckInputs = [
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

  meta = with lib; {
    description = "Python YAML formatter that keeps your comments";
    homepage = "https://github.com/lyz-code/yamlfix";
    changelog = "https://github.com/lyz-code/yamlfix/blob/${version}/CHANGELOG.md";
    license = licenses.gpl3Only;
    maintainers = with maintainers; [ koozz ];
  };
}

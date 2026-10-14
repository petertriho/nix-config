{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-tasks";
  version = "0.9.1-unstable-2026-10-13";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-tasks";
    rev = "c820715be1bf05db36d0739e88061b97b8c2c9d3";
    hash = "sha256-H+l6YII6IyYCBdTARP4W3MyYiHMANgjOJWrMHDZolJk=";
  };

  nativeBuildInputs = [ jq ];
  dontConfigure = true;
  dontBuild = true;

  # Pi loads src/index.ts directly and supplies TypeBox and the Pi packages.
  # Physical copies can bypass Pi's module mapping, so no npm install is needed.
  postPatch = ''
    jq '
      del(.dependencies.typebox, .devDependencies)
      | .peerDependencies += {
          "typebox": "*",
          "@earendil-works/pi-coding-agent": "*",
          "@earendil-works/pi-tui": "*"
        }
    ' package.json > package.json.tmp
    mv package.json.tmp package.json
  '';

  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-tasks
    mkdir -p "$packageRoot"
    cp package.json README.md CHANGELOG.md CONTRIBUTING.md CUSTOMIZING.md SECURITY.md LICENSE "$packageRoot/"
    cp -r src "$packageRoot/"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    packageRoot=$out/lib/node_modules/pi-tasks
    jq -e '
      ((.dependencies // {}) | length == 0)
      and (.peerDependencies.typebox == "*")
      and (.peerDependencies["@earendil-works/pi-coding-agent"] == "*")
      and (.peerDependencies["@earendil-works/pi-tui"] == "*")
    ' "$packageRoot/package.json" > /dev/null
    test -f "$packageRoot/src/index.ts"
    test ! -e "$packageRoot/node_modules"

    runHook postInstallCheck
  '';

  meta = {
    description = "Claude Code-style task tracking and coordination extension for Pi";
    homepage = "https://github.com/tintinweb/pi-tasks";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

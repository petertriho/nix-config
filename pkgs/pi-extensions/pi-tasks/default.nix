{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  jq,
}:
stdenvNoCC.mkDerivation {
  pname = "pi-tasks";
  version = "0.9.0-unstable-2026-08-24";

  src = fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-tasks";
    rev = "29180d72498bdd77d5601dc77a9093d25da42102";
    hash = "sha256-2Wa+lUHQP6qvnRERaqFNu1IkOD4d5etb+x6oTCqh6Vg=";
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

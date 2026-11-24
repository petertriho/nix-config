{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  jq,
  yq-go,
  makeWrapper,
  nodejs,
}:
let
  # The CLI build imports only these packages. The build scripts import the
  # four dependencies and esbuild. The bundles include cssomnom, linkedom, and
  # ts-morph. The upstream lockfile also pins coding-agent CLIs, an ONNX
  # runtime, and Playwright for evals and embedding. fetchPnpmDeps installs with --force, so it would download each
  # of them for every platform, which is several GB. A release that adds a
  # build import fails with esbuild "Could not resolve" or
  # ERR_MODULE_NOT_FOUND until the package is added here.
  buildDependencies = [
    "@11ty/gray-matter"
    "@mdn/browser-compat-data"
    "marked"
    "web-features"
  ];
  buildDevDependencies = [
    "esbuild"
    "cssomnom"
    "linkedom"
    "ts-morph"
  ];

  keepOnly =
    names:
    "with_entries(select(${
      lib.concatMapStringsSep " or " (name: ".key == ${builtins.toJSON name}") names
    }))";

  # The fetcher and the build both run this, so their frozen installs see the
  # same manifest and importer. pnpm installs only the packages that the pruned
  # importer reaches, so the other lockfile entries can stay. The tools are
  # referenced by store path because the fetcher PATH holds only its own tools.
  pruneDependencies = ''
    ${lib.getExe jq} '.dependencies |= ${keepOnly buildDependencies} | .devDependencies |= ${keepOnly buildDevDependencies}' \
      package.json > package.json.pruned
    mv package.json.pruned package.json
    ${lib.getExe yq-go} -i '.importers["."].dependencies |= ${keepOnly buildDependencies} | .importers["."].devDependencies |= ${keepOnly buildDevDependencies}' \
      pnpm-lock.yaml
  '';
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "modern-web-guidance";
  version = "1.0.2";

  # Upstream builds the npm package from this repository. Every release tag
  # carries the vector cache for all guide chunks. Commits between releases
  # can index new chunks for keyword search only.
  src = fetchFromGitHub {
    owner = "GoogleChrome";
    repo = "modern-web-guidance-src";
    tag = "v${finalAttrs.version}";
    hash = "sha256-G6EXSN3fx1I3I7nkig8+q+BBdJzwoTJR4RqafrXfdiA=";
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    postPatch = pruneDependencies;
    pnpm = pnpm_10;
    fetcherVersion = 5;
    hash = "sha256-HW+Yk6yLaIl6x12HyObXd20iCkI0vCRr7ZeO0v2Hpsw=";
  };

  nativeBuildInputs = [
    nodejs
    pnpmConfigHook
    pnpm_10
    makeWrapper
  ];

  # build-dist.ts reads both values from git, and the source has no .git.
  # Upstream skill versions hold the date and short SHA of the last SKILL.md
  # commit. The CLI warns only when the caller's dated version is older than
  # its own. Nix installs SKILL.md with the CLI, and the package version has no
  # date, so the warning never shows.
  env = {
    MWG_SKILL_VERSION = finalAttrs.version;
    MWG_VERSION = finalAttrs.version;
  };

  # git is not in the build environment, so a git call that the patch does not
  # bypass fails the build.
  #
  # `install`, `update`, and `uninstall` run `npx skills`, which writes into
  # skill directories that Nix manages. The CLI refuses them.
  postPatch = pruneDependencies + ''
    substituteInPlace src/build/build-dist.ts \
      --replace-fail 'const skillVersion = gitExec(' 'const skillVersion = process.env.MWG_SKILL_VERSION || gitExec(' \
      --replace-fail 'version = getLatestVersion();' 'version = process.env.MWG_VERSION || getLatestVersion();'

    for command in install update uninstall; do
      substituteInPlace src/cli/modern-web.ts --replace-fail \
        "} else if (command === \"$command\") {" \
        "} else if (command === \"$command\") { console.error(\"modern-web-guidance: $command is disabled. Nix manages this skill (programs.modern-web-guidance).\"); process.exit(1);"
    done
  '';

  buildPhase = ''
    runHook preBuild
    node src/build/build-dist.ts
    runHook postBuild
  '';

  # Upstream SKILL.md runs an unpinned CLI through `npx @latest`. Point it at
  # the pinned CLI on PATH instead. The guards fail the build when upstream
  # text changes, so a bump cannot ship an `npx` command or a stale
  # `--skill-version`, which makes the CLI print an update nag.
  postBuild = ''
    skillDir=dist/skills-cli/skills/modern-web-guidance
    skillMd=$skillDir/SKILL.md

    substituteInPlace "$skillMd" \
      --replace-fail 'npx -y modern-web-guidance@latest' 'modern-web-guidance' \
      --replace-fail 'Run `modern-web-guidance` directly with `npx` using' 'Run `modern-web-guidance` using'

    grep -q '^## Using npx / pnpx$' "$skillMd"
    grep -q '^## Guidelines$' "$skillMd"
    awk '
      /^## Using npx \/ pnpx$/ {
        skip = 1
        print "## Running the CLI"
        print ""
        print "- Run `modern-web-guidance` directly. Nix installs it on `PATH` with its guides and search index, so it runs offline and needs no network access."
        print ""
        next
      }
      /^## Guidelines$/ { skip = 0 }
      !skip
    ' "$skillMd" > "$skillMd.tmp"
    mv "$skillMd.tmp" "$skillMd"

    grep -q '^## Running the CLI$' "$skillMd"
    if grep -nE '\bp?npx\b' "$skillMd"; then
      echo "$skillMd still references npx" >&2
      exit 1
    fi
    grep -qF -- "--skill-version $(cat $skillDir/skill-version.txt)" "$skillMd"
  '';

  # The watchdog is the only code that sends telemetry (to
  # play.googleapis.com). The wrapper also sets DISABLE_TELEMETRY, so either
  # block alone stops it. The `test` and `grep` guards stop an upstream move
  # from silently reinstating it.
  installPhase = ''
    runHook preInstall

    distDir=dist/skills-cli

    test -f $distDir/skills/modern-web-guidance/watchdog/main.js
    rm -r $distDir/skills/modern-web-guidance/watchdog

    install -d $out/share/modern-web-guidance
    cp -r $distDir/{package.json,LICENSE,THIRD_PARTY_NOTICES,skills} $out/share/modern-web-guidance/

    makeWrapper ${lib.getExe nodejs} $out/bin/modern-web-guidance \
      --add-flags $out/share/modern-web-guidance/skills/modern-web-guidance/modern-web.mjs \
      --set DISABLE_TELEMETRY 1

    if grep -rlF play.googleapis.com $out/share; then
      echo "telemetry endpoint found in the installed tree" >&2
      exit 1
    fi

    runHook postInstall
  '';

  # Outputs go to files first. A reader that exits early, such as `grep -q`,
  # can make the CLI fail with EPIPE under pipefail.
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck

    export HOME=$(mktemp -d)
    cli=$out/bin/modern-web-guidance

    test "$($cli --version)" = ${finalAttrs.version}

    $cli list > "$HOME/list.json"
    grep -qF '"id":"dialog"' "$HOME/list.json"

    $cli search "dialog element" > "$HOME/search.json"
    grep -qF '"id":"dialog"' "$HOME/search.json"

    # With stdout on a file, retrieve prints the guide instead of saving it.
    $cli retrieve dialog > "$HOME/dialog.md"
    grep -q '^# Dialog$' "$HOME/dialog.md"

    fixture=$(mktemp -d)
    printf '.box { -webkit-border-radius: 4px; }\n' > "$fixture/style.css"
    printf 'document.querySelector(".box").addEventListener("click", () => {});\n' > "$fixture/app.js"
    $cli legacy-scan "$fixture" --json > "$HOME/scan.json"
    ${lib.getExe jq} -e '.activeRuleCount > 0' "$HOME/scan.json" > /dev/null

    if $cli install 2> "$HOME/install.err"; then
      echo "modern-web-guidance install is not disabled" >&2
      exit 1
    fi
    grep -qF 'Nix manages this skill' "$HOME/install.err"

    test -f $out/share/modern-web-guidance/skills/modern-web-guidance/SKILL.md
    test -f $out/share/modern-web-guidance/skills/chrome-extensions/SKILL.md

    runHook postInstallCheck
  '';

  meta = {
    description = "Modern web platform guidance skill and offline search CLI for coding agents";
    homepage = "https://github.com/GoogleChrome/modern-web-guidance-src";
    # Apache 2.0 for the code, CC BY 4.0 for the guides.
    license = with lib.licenses; [
      asl20
      cc-by-40
    ];
    mainProgram = "modern-web-guidance";
    maintainers = [ ];
    platforms = nodejs.meta.platforms;
  };
})

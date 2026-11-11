{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  nodejs,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "modern-web-guidance";
  version = "0.0.205";

  # The CLI bundle exists only in the npm tarball. The GitHub repository holds
  # the skills and guides without it.
  src = fetchurl {
    url = "https://registry.npmjs.org/modern-web-guidance/-/modern-web-guidance-${finalAttrs.version}.tgz";
    hash = "sha512-b1OipAUini1LxFNI4+zidanjkXX27rCnMI0OdZm0cXLUIl9swpvf8T+OlS4AMJttlEqABJrr0YXVLnInXAACRg==";
  };

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;

  # Upstream SKILL.md runs an unpinned CLI through `npx @next`. Point it at the
  # pinned CLI on PATH instead. The guards fail the build when upstream text
  # changes, so a bump cannot ship an `npx` command or a stale
  # `--skill-version`, which makes the CLI print an update nag.
  #
  # `install`, `update`, and `uninstall` run `npx skills`, which writes into
  # skill directories that Nix manages. The CLI refuses them.
  postPatch = ''
    skillDir=skills/modern-web-guidance
    skillMd=$skillDir/SKILL.md

    substituteInPlace "$skillMd" \
      --replace-fail 'npx -y modern-web-guidance@next' 'modern-web-guidance' \
      --replace-fail 'npx modern-web-guidance@next set-baseline' 'modern-web-guidance set-baseline' \
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

    for command in install update uninstall; do
      substituteInPlace $skillDir/modern-web.mjs --replace-fail \
        "} else if (command === \"$command\") {" \
        "} else if (command === \"$command\") { console.error(\"modern-web-guidance: $command is disabled. Nix manages this skill (programs.modern-web-guidance).\"); process.exit(1);"
    done
  '';

  # The watchdog is the only code that sends telemetry (to
  # play.googleapis.com). The wrapper also sets DISABLE_TELEMETRY, so either
  # block alone stops it. The `test` and `grep` guards stop an upstream move
  # from silently reinstating it.
  installPhase = ''
    runHook preInstall

    test -f skills/modern-web-guidance/watchdog/main.js
    rm -r skills/modern-web-guidance/watchdog

    install -d $out/share/modern-web-guidance
    cp -r package.json LICENSE THIRD_PARTY_NOTICES skills $out/share/modern-web-guidance/

    makeWrapper ${lib.getExe nodejs} $out/bin/modern-web-guidance \
      --add-flags $out/share/modern-web-guidance/skills/modern-web-guidance/modern-web.mjs \
      --set DISABLE_TELEMETRY 1

    if grep -rlF play.googleapis.com $out/share; then
      echo "telemetry endpoint found in the installed tree" >&2
      exit 1
    fi

    runHook postInstall
  '';

  meta = {
    description = "Modern web platform guidance skill and offline search CLI for coding agents";
    homepage = "https://github.com/GoogleChrome/modern-web-guidance";
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

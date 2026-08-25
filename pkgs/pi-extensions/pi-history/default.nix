{
  lib,
  stdenv,
  fetchFromGitHub,
}:
stdenv.mkDerivation {
  pname = "pi-history";
  version = "0.1.7-unstable-2026-08-25";

  src = fetchFromGitHub {
    owner = "sagmans";
    repo = "pi-history";
    rev = "df8c3dba5a52d5a279875401877ea68220746cc9";
    hash = "sha256-lyodMCZU9Gpppn14zDU4uVFGvNyFiTwWCGzxxEJAPnI=";
  };

  dontBuild = true;

  # Ghost completion works by anchoring on the cursor in the editor's rendered
  # output. The native editor draws a reverse-video end-of-line cursor cell
  # (CURSOR_AT_END_RENDER = "\x1b[7m \x1b[0m"); pi-vim in insert mode instead
  # strips that cell and drives a hardware bar cursor, leaving only the
  # zero-width CURSOR_MARKER anchor behind — so upstream pi-history's
  # findGhostTarget finds nothing and disables ghost. ghost-cursor-marker.patch
  # teaches findGhostTarget/renderGhost to fall back to the CURSOR_MARKER anchor
  # (rendering the suggestion as dim text right at the hardware cursor), which
  # restores ghost completion under pi-vim with no change to vim's cursor.
  patches = [
    ./ghost-cursor-marker.patch
  ];

  postPatch = ''
    substituteInPlace src/history-editor.ts \
      --replace-fail "this.options.onGhostUnavailable?.(reason);" "/* ghost-unavailable notification suppressed: incompatible with framed modal editors */"
  '';
  # pi-history ships raw TypeScript (pi.extensions = ["./index.ts"]) that pi
  # loads directly, and its only imports are the @earendil-works/* packages pi
  # injects as peerDependencies at runtime. It therefore has zero runtime
  # dependencies — unlike the other extensions in this overlay, buildNpmPackage
  # buys nothing here and would fetch a ~380MB dev-only FOD (the whole
  # pi-coding-agent dev tree, all pruned by --omit=dev) for a package with no
  # build step. A plain copy of the files upstream declares in its `files`
  # field is sufficient and correct. The install path matches pi's
  # piPackageRoot helper, which resolves lib/node_modules/<pname>.
  installPhase = ''
    runHook preInstall

    packageRoot=$out/lib/node_modules/pi-history
    mkdir -p "$packageRoot"
    cp package.json index.ts config.json config.local.example.json "$packageRoot/"
    cp -r src "$packageRoot/"
    cp -r resources "$packageRoot/"

    runHook postInstall
  '';

  meta = {
    description = "Ghost completion for prompt history in pi's TUI";
    homepage = "https://github.com/sagmans/pi-history";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

{
  tmuxPlugins,
  fetchFromGitHub,
  zig_0_16,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "flash";
  version = "0.2.0-unstable-2026-09-21";
  src = fetchFromGitHub {
    owner = "and-rs";
    repo = "flash.tmux";
    rev = "62c230f57060f049f444f6b920424efb9270ed94";
    sha256 = "sha256-fFJVLbkVFbTSGt/zcGhyM9POk1G0Op7qOhPFVyu0834=";
  };
  rtpFilePath = "flash.tmux";
  nativeBuildInputs = [ zig_0_16 ];
  buildPhase = ''
    runHook preBuild
    export HOME="$TMPDIR"
    zig build -Doptimize=ReleaseFast
    runHook postBuild
  '';
  postInstall = ''
    rm -rf "$target/.zig-cache"
    test -x "$target/zig-out/bin/flash_tmux"
    bin_version="$("$target/zig-out/bin/flash_tmux" --version)"
    file_version="$(tr -d ' \t\r\n' < "$target/VERSION")"
    if [ "$bin_version" != "$file_version" ]; then
      echo "flash_tmux --version mismatch: binary '$bin_version' != VERSION '$file_version'" >&2
      exit 1
    fi
  '';
}

{
  tmuxPlugins,
  fetchFromGitHub,
  zig_0_16,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "flash";
  version = "0.2.2-unstable-2026-09-24";
  src = fetchFromGitHub {
    owner = "and-rs";
    repo = "flash.tmux";
    rev = "65a220bd69616eb9dc1f4358166888ce1f70db7c";
    sha256 = "sha256-8YFy/PUt7noUZ4zcikIRfKvlduMh1m4ZlftiJtik8yc=";
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

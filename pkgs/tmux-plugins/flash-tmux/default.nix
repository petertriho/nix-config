{
  tmuxPlugins,
  fetchFromGitHub,
  zig_0_16,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "flash";
  version = "0.1.5-unstable-2026-09-16";
  src = fetchFromGitHub {
    owner = "and-rs";
    repo = "flash.tmux";
    rev = "4ad7d0f75fa0c9b79e61f09f3ba61d7bc91dc95c";
    sha256 = "sha256-lxl/1+4rBdvyK8QdswWJGCxneIu9jjsBoujL6id1yZs=";
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

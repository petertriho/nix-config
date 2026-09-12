{
  tmuxPlugins,
  fetchFromGitHub,
  zig_0_16,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "flash";
  version = "0.1.2-unstable-2026-09-11";
  src = fetchFromGitHub {
    owner = "and-rs";
    repo = "flash.tmux";
    rev = "ffde0ddb1c1173da96b313a709a66c90e76018c9";
    sha256 = "sha256-+JSL1AB9rRb1oucEHTzBRw9tbkVf+RKZiJnpdCeIFK8=";
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

{
  tmuxPlugins,
  fetchFromGitHub,
  zig_0_16,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "flash";
  version = "0.1.4-unstable-2026-09-14";
  src = fetchFromGitHub {
    owner = "and-rs";
    repo = "flash.tmux";
    rev = "a0548461801a880b9b640ded951e9ddac42554d2";
    sha256 = "sha256-8vhi1bseqE0jmOTj5a036KSccuLI8np3G9Kf/xuBFas=";
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

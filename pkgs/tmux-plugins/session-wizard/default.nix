{
  tmuxPlugins,
  fetchFromGitHub,
  pkgs,
  makeWrapper,
  ...
}:
tmuxPlugins.mkTmuxPlugin rec {
  pluginName = "session-wizard";
  version = "V1.5.0-unstable-2025-02-28";
  src = fetchFromGitHub {
    owner = "27medkamal";
    repo = "tmux-session-wizard";
    rev = "c642809ebc5ceaa1431db9ce365554ab4ea92c31";
    sha256 = "12rxd4yjhk1zb97fsyf1n17ma025rr3cvqvzrbl4j46m0ciax51z";
  };
  rtpFilePath = "${pluginName}.tmux";
  nativeBuildInputs = [ makeWrapper ];
  postInstall = ''
    for f in .gitignore Dockerfile flake.* scripts tests; do
        rm -rf $target/$f
    done
    substituteInPlace $target/session-wizard.tmux --replace \$CURRENT_DIR $target
    wrapProgram $target/bin/t \
        --prefix PATH :${
          with pkgs;
          lib.makeBinPath [
            fzf
            zoxide
            coreutils
            gnugrep
            gnused
          ]
        }
    mkdir -p $out/bin
    makeWrapper $target/bin/t $out/bin/session-wizard
  '';
}

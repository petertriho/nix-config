{
  tmuxPlugins,
  fetchFromGitHub,
  pkgs,
  makeWrapper,
  ...
}:
tmuxPlugins.mkTmuxPlugin rec {
  pluginName = "session-wizard";
  version = "unstable-2024-10-30";
  src = fetchFromGitHub {
    owner = "27medkamal";
    repo = "tmux-session-wizard";
    rev = "5f574960dfe6dd889ee5dc136473f3a0507682bf";
    sha256 = "14wghnasvqczq9srkg96fcy46ydlyq6p7lv87irndzxqbklak0fs";
  };
  rtpFilePath = "${pluginName}.tmux";
  nativeBuildInputs = [ makeWrapper ];
  postInstall = ''
    for f in .gitignore Dockerfile flake.* scripts tests; do
      rm -rf $target/$f
    done
    substituteInPlace $target/session-wizard.tmux --replace  \$CURRENT_DIR $target
    wrapProgram $target/bin/t \
      --prefix PATH : ${
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

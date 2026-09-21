# https://github.com/NixOS/nixpkgs/pull/296174
{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  makeWrapper,
  pythonInputs,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmux-window-name";
  version = "0-unstable-2026-09-20";
  src = fetchFromGitHub {
    owner = "ofirgall";
    repo = "tmux-window-name";
    rev = "c32497f249888c3f98cb245f78a0bcc8d05b2a46";
    sha256 = "sha256-gBNgLG3NGSd6zF8SuzXCNPj1AbF1S18L5cgNdxQPQhA=";
  };
  patches = [ ./wrapper-programs.patch ];
  nativeBuildInputs = [ makeWrapper ];
  rtpFilePath = "tmux_window_name.tmux";
  postInstall =
    # sh
    ''
      NIX_BIN_PATH="/nix/store/\\\S+/bin"
      # Update USR_BIN_REMOVER with .nix-profile PATH
      sed -i "s|^USR_BIN_REMOVER.*|USR_BIN_REMOVER = (r\'^$NIX_BIN_PATH/(.+)( --.*)?\', r\'\\\g<1>\')|" $target/scripts/rename_session_windows.py

      for f in tmux_window_name.tmux scripts/rename_session_windows.py; do
        wrapProgram $target/$f \
          --prefix PATH : ${lib.makeBinPath [ pythonInputs ]}
      done
    '';
}

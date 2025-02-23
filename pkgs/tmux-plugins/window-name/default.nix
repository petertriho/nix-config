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
  version = "unstable-2025-02-22";
  src = fetchFromGitHub {
    owner = "ofirgall";
    repo = "tmux-window-name";
    rev = "baf696c0f979490d37f6a29515752b31e2d6d70c";
    sha256 = "0c0wvs909dfc7g6ihph4npmaiqmz630lbii9p3mfc1acaza3jaw4";
  };
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

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
  version = "unstable-2025-01-21";
  src = fetchFromGitHub {
    owner = "ofirgall";
    repo = "tmux-window-name";
    rev = "28bbe2a117bf728087fc41f6c9892b45bae01c90";
    sha256 = "13dc6bdmpbwmj2x41k28dfqrif1vn27cpaz15fy54dzvwhjhy9cs";
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

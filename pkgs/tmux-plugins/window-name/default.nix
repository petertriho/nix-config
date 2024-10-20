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
  version = "unstable-2024-08-30";
  src = fetchFromGitHub {
    owner = "ofirgall";
    repo = "tmux-window-name";
    rev = "dc97a79ac35a9db67af558bb66b3a7ad41c924e7";
    sha256 = "048j942jgplqvqx65ljfc278fn7qrhqx4bzmgzcvmg9kgjap7dm3";
  };
  nativeBuildInputs = [ makeWrapper ];
  rtpFilePath = "tmux_window_name.tmux";
  postInstall =
    # sh
    ''
      NIX_BIN_PATH="${builtins.getEnv "HOME"}/.nix-profile/bin"
      # Update USR_BIN_REMOVER with .nix-profile PATH
      sed -i "s|^USR_BIN_REMOVER.*|USR_BIN_REMOVER = (r\'^$NIX_BIN_PATH/(.+)( --.*)?\', r\'\\\g<1>\')|" $target/scripts/rename_session_windows.py

      # Update substitute_sets with .nix-profile PATHs
      sed -i "s|^\ssubstitute_sets: List.*|    substitute_sets: List[Tuple] = field(default_factory=lambda: [(\'/$NIX_BIN_PATH/(.+) --.*\', \'\\\g<1>\'), (r\'.+ipython([32])\', r\'ipython\\\g<1>\'), USR_BIN_REMOVER, (r\'(bash) (.+)/(.+[ $])(.+)\', \'\\\g<3>\\\g<4>\')])|" $target/scripts/rename_session_windows.py

      # Update dir_programs with .nix-profile PATH for applications
      sed -i "s|^\sdir_programs: List.*|    dir_programs: List[str] = field(default_factory=lambda: [["$NIX_BIN_PATH/vim", "$NIX_BIN_PATH/vi", "$NIX_BIN_PATH/git", "$NIX_BIN_PATH/nvim"]])|" $target/scripts/rename_session_windows.py

      for f in tmux_window_name.tmux scripts/rename_session_windows.py; do
        wrapProgram $target/$f \
          --prefix PATH : ${lib.makeBinPath [ pythonInputs ]}
      done
    '';
}

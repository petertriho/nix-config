{ config, ... }:
{
  home.sessionPath = [ "$HOME/.local/bin" ];

  home.file.".local/bin".source = config.lib.meta.mkDotfilesSymlink "scripts/.local/bin";
  xdg.configFile = {
    "fish/completions/update.fish".source =
      config.lib.meta.mkDotfilesSymlink "scripts/.config/fish/completions/update.fish";
    "fish/completions/nix-direnv-helper.fish".source =
      config.lib.meta.mkDotfilesSymlink "scripts/.config/fish/completions/nix-direnv-helper.fish";
  };
}

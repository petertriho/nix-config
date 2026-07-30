{ config, ... }:
{
  programs.starship = {
    enable = true;
    configPath = "${config.xdg.configHome}/starship/starship.toml";
    settings = builtins.fromTOML (
      builtins.readFile ../../dotfiles/starship/.config/starship/starship.toml
    );
  };
}

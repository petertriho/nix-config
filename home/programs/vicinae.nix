{
  config,
  lib,
  pkgs,
  ...
}:
{
  programs.vicinae = {
    enable = true;
    package = pkgs.vicinae;
    extensions = [ pkgs.vicinaeExtensions.bitwarden ];
    systemd = {
      enable = true;
      autoStart = true;
    };
    settings = {
      activate_on_single_click = true;
      close_on_focus_loss = true;
      favicon_service = "twenty";
      launcher_window = {
        client_side_decorations = {
          enabled = true;
          rounding = 10;
        };
      };
      pop_to_root_on_close = true;
      providers.applications.preferences.defaultAction = "launch";
      providers.files = {
        enabled = false;
        # `enabled = false` only hides the entrypoints. The indexer process still starts unless this is off.
        preferences.autoIndexing = false;
      };
      providers.power.entrypoints = {
        "power-off".preferences.confirm = false;
        reboot.preferences.confirm = false;
        logout.preferences.confirm = false;
        logout.preferences.customProgram = "niri msg action quit";
      };
      search_files_in_root = false;
      telemetry.system_info = false;
    };
  };

  systemd.user.services.vicinae = lib.mkIf config.programs.vicinae.systemd.enable {
    # Restart after extension updates so Vicinae rescans the new symlink targets.
    Unit.X-Restart-Triggers = config.programs.vicinae.extensions;
  };
}

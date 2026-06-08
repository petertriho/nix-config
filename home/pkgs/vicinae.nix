{ ... }:
{
  services.vicinae = {
    enable = true;
    systemd = {
      enable = true;
      autoStart = true;
    };
    settings = {
      activate_on_single_click = true;
      close_on_focus_loss = true;
      favicon_service = "twenty";
      font.normal.size = 11;
      launcher_window = {
        opacity = 1;
        client_side_decorations = {
          enabled = true;
          rounding = 10;
        };
      };
      pop_to_root_on_close = true;
      providers.applications.preferences.defaultAction = "launch";
      providers.power.entrypoints = {
        "power-off".preferences.confirm = false;
        reboot.preferences.confirm = false;
        logout.preferences.confirm = false;
        logout.preferences.customProgram = "niri msg action quit";
      };
      search_files_in_root = true;
      telemetry.system_info = false;
      theme = {
        light.name = "vicinae-dark";
        dark.name = "vicinae-dark";
      };
    };
  };
}

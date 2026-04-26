{ ... }:
{
  services.vicinae = {
    enable = true;
    systemd = {
      enable = true;
      autoStart = true;
    };
    settings = {
      faviconService = "twenty";
      font.size = 11;
      popToRootOnClose = true;
      providers.power.entrypoints = {
        "power-off".preferences.confirm = false;
        reboot.preferences.confirm = false;
        logout.preferences.confirm = false;
      };
      rootSearch.searchFiles = false;
      telemetry.system_info = false;
      theme.name = "vicinae-dark";
      window = {
        csd = true;
        opacity = 0.95;
        rounding = 10;
      };
    };
  };
}

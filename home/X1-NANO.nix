{ ... }:
{
  imports = [
    ./desktop.nix
  ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-4.1";
    };
  };
  wayland.windowManager.hyprland = {
    settings = {
      monitorv2 = {
        output = "desc:Chimei Innolux Corporation 0x1301";
        mode = "preferred";
        position = "auto";
        scale = 1.50;
      };
    };
  };
}

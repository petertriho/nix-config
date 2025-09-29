{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
  ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-4.1";
      # tell hyprland to use intel igpu
      AQ_DRM_DEVICES = "/dev/dri/intel-igpu:/dev/dri/nvidia-dgpu";
    };
    packages = with pkgs; [
      cura-appimage
    ];
  };
  wayland.windowManager.hyprland = {
    settings = {
      monitorv2 = {
        output = "desc:Chimei Innolux Corporation 0x14F2";
        mode = "preferred";
        position = "auto";
        scale = 1.25;
      };
    };
  };
}

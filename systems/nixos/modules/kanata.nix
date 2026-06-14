{ pkgs, ... }:
let
  keymaps = import ../../../modules/system/kanata/keymaps.nix;
in
{
  environment.systemPackages = with pkgs; [
    kanata
  ];

  services.udev.extraRules = ''
    # Allow browser WebHID configurators to open the MAD 68 Pro R.
    KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="373b", ATTRS{idProduct}=="10d4", MODE="0660", GROUP="users"
  '';

  services.kanata = {
    enable = true;
    keyboards = {
      thinkpad = {
        devices = [
          "/dev/input/by-path/platform-i8042-serio-0-event-kbd"
        ];
        extraDefCfg = "process-unmapped-keys yes";
        config = keymaps.thinkpad;
      };

      mad68pror = {
        devices = [
          "/dev/input/by-id/usb-Shenzhen_Yizhita_Technology_Co.__Ltd._MAD_68_Pro_R_2024-04-25-event-kbd"
        ];
        extraDefCfg = "process-unmapped-keys yes";
        config = keymaps.mad68pror;
      };
    };
  };
}

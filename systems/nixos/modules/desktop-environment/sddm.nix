{ pkgs, ... }:
{
  services.displayManager.sddm = {
    enable = true;
    theme = "where_is_my_sddm_theme";
  };
  environment.systemPackages = with pkgs; [
    (where-is-my-sddm-theme.override {
      themeConfig.General = {
        passwordCharacter = "*";
        passwordMask = true;
        passwordInputWidth = "0.5";
        passwordInputBackground = "";
        passwordInputRadius = "";
        passwordInputCursorVisible = true;
        passwordFontSize = 24;
        passwordCursorColor = "#ffffff";
        passwordTextColor = "";
        showSessionsByDefault = false;
        sessionsFontSize = 12;
        showUsersByDefault = false;
        usersFontSize = 12;
        background = "";
        backgroundFill = "#000000";
        backgroundFillMode = "aspect";
        basicTextColor = "#ffffff";
        blurRadius = "";
        helpFontSize = 12;
      };
    })
  ];
}

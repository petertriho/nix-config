{
  outputs,
  pkgs,
  config,
  lib,
  ...
}:
{
  imports = [
    outputs.options
  ];

  options = with lib; {
    user = mkOption {
      type = types.str;
      description = "Username";
    };
    homePath = mkOption {
      type = types.str;
      description = "User's home path";
      default = strings.concatStrings [
        (if pkgs.stdenv.isLinux then "/home/" else "/Users/")
        config.user
      ];
    };
  };
}

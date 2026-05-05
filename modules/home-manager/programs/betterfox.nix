{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.betterfox;
  configFiles = cfg.package.configs;
  configOrder = [
    "userjs"
    "fastfox"
    "securefox"
    "peskyfox"
  ];

  enabledConfigs =
    (lib.filter (configName: cfg.configs.${configName}) configOrder)
    ++ lib.optional (cfg.configs.smoothfox != "none") "smoothfox-${cfg.configs.smoothfox}";

  parsePrefLine = line:
    let
      trimmed = lib.strings.trim line;
      stringMatch = builtins.match ''user_pref\("([^"]+)",[[:space:]]*"([^"]*)"\);.*'' trimmed;
      boolMatch = builtins.match ''user_pref\("([^"]+)",[[:space:]]*(true|false)\);.*'' trimmed;
      intMatch = builtins.match ''user_pref\("([^"]+)",[[:space:]]*(-?[0-9]+)\);.*'' trimmed;
      match =
        if lib.hasPrefix "//" trimmed then
          null
        else if stringMatch != null then
          {
            name = builtins.elemAt stringMatch 0;
            value = builtins.elemAt stringMatch 1;
          }
        else if boolMatch != null then
          {
            name = builtins.elemAt boolMatch 0;
            value = builtins.elemAt boolMatch 1 == "true";
          }
        else if intMatch != null then
          {
            name = builtins.elemAt intMatch 0;
            value = lib.toInt (builtins.elemAt intMatch 1);
          }
        else
          null;
    in
    if match == null then
      { }
    else
      {
        ${match.name} = {
          Value = match.value;
          Status = cfg.status;
        };
      };

  parseConfig = configName:
    lib.foldl' (preferences: line: preferences // parsePrefLine line) { } (
      lib.splitString "\n" (builtins.readFile "${cfg.package}/share/betterfox/${configFiles.${configName}}")
    );

  betterfoxPreferences = lib.foldl' (
    preferences: configName: preferences // parseConfig configName
  ) { } enabledConfigs;

  extraPreferences = lib.mapAttrs (_: value: {
    Value = value;
    Status = cfg.status;
  }) cfg.extraPreferences;

  preferences = betterfoxPreferences // extraPreferences;

  wrappedPackage = pkgs.wrapFirefox cfg.browserPackage {
    extraPolicies = {
      Preferences = preferences;
    };
  };
in
{
  options.programs.betterfox = {
    enable = lib.mkEnableOption "Betterfox Firefox-family browser policies";

    package = lib.mkPackageOption pkgs "betterfox" { };

    browserPackage = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = null;
      example = lib.literalExpression "pkgs.floorp-bin.unwrapped";
      description = "Firefox-family unwrapped browser package to wrap with Betterfox policies.";
    };

    configs = {
      userjs = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Include Betterfox user.js.";
      };

      fastfox = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Include Betterfox Fastfox.js.";
      };

      securefox = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Include Betterfox Securefox.js.";
      };

      peskyfox = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Include Betterfox Peskyfox.js.";
      };

      smoothfox = lib.mkOption {
        type = lib.types.enum [
          "none"
          "sharpen"
          "instant"
          "smooth"
          "natural"
        ];
        default = "none";
        description = "Betterfox Smoothfox scrolling preset. Smoothfox presets are mutually exclusive.";
      };
    };

    status = lib.mkOption {
      type = lib.types.enum [
        "default"
        "locked"
      ];
      default = "default";
      description = "Mozilla policy preference status. Use default to keep user.js/user prefs overridable.";
    };

    extraPreferences = lib.mkOption {
      type = lib.types.attrsOf (
        lib.types.oneOf [
          lib.types.bool
          lib.types.int
          lib.types.str
        ]
      );
      default = { };
      example = {
        "media.ffmpeg.vaapi.enabled" = true;
      };
      description = "Additional Mozilla preferences appended as policies after Betterfox configs.";
    };

    wrappedPackage = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      readOnly = true;
      default = if cfg.browserPackage == null then null else wrappedPackage;
      description = "Browser package wrapped with selected Betterfox policies.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = lib.optional (cfg.browserPackage != null) wrappedPackage;

    assertions = [
      {
        assertion = enabledConfigs != [ ] || cfg.extraPreferences != { };
        message = "programs.betterfox must enable at least one config or set extraPreferences.";
      }
    ];
  };
}

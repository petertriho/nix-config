{
  config,
  lib,
  pkgs,
  ...
}:

let
  configPath = "${config.home.homeDirectory}/.nix-config";

  mkSymlink = relativePath: config.lib.file.mkOutOfStoreSymlink "${configPath}/${relativePath}";

  # Declared values win, arrays replace, and undeclared keys stay. The type check gives a clear
  # error instead of a jq error when either file does not hold a JSON object.
  jqMergeObjects = ''if ($dynamic | type) == "object" and ($static | type) == "object" then $dynamic * $static else error("expected JSON objects") end'';
in
{
  # https://github.com/nix-community/home-manager/issues/676
  lib.meta = {
    inherit configPath mkSymlink jqMergeObjects;

    mkDotfilesSymlink = relativePath: mkSymlink "dotfiles/${relativePath}";

    # Merge Nix-declared settings into a writable JSON file. Returns an activation snippet, so a
    # caller can add checks to the same entry. Place the entry after `linkGeneration`.
    mkMutableJsonConfig =
      {
        path,
        staticSettings,
        jqOperation ? jqMergeObjects,
        empty ? "{}",
        mode ? "600",
      }:
      lib.hm.generators.mkImpureConfigMerger {
        inherit
          pkgs
          path
          staticSettings
          jqOperation
          empty
          mode
          ;
        format = "json";
      };
  };
}

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

    # Copy a skill folder and replace the `description` field in the frontmatter of its SKILL.md.
    # Use it when skills from different tools claim the same requests. The new value is written as
    # a JSON string, which is valid YAML. The build fails if SKILL.md has no closed frontmatter or
    # no `description` field.
    mkSkillWithDescription =
      {
        name,
        source,
        description,
      }:
      pkgs.runCommand "${name}-skill" { skillDescription = builtins.toJSON description; } ''
        cp -r --no-preserve=mode ${source} $out
        ${lib.getExe pkgs.gawk} '
          NR == 1 { if ($0 != "---") exit 1; fm = 1; print; next }
          fm && $0 == "---" { fm = 0; closed = 1; print; next }
          fm && /^description:/ { print "description: " ENVIRON["skillDescription"]; found = 1; skip = 1; next }
          fm && skip && /^[[:space:]]/ { next }
          fm { skip = 0 }
          { print }
          END { if (!closed || !found) exit 1 }
        ' ${source}/SKILL.md > $out/SKILL.md
      '';
  };
}

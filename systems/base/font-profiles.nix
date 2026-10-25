# Font profiles selected by the `font` option. `features` are HarfBuzz feature
# strings shared by Ghostty `font-feature` and WezTerm `harfbuzz_features`.
# `cvXX` tags are font-specific, so each profile carries its own list.
{ pkgs }:
{
  jetbrains-mono = {
    monospace = {
      package = pkgs.nerd-fonts.jetbrains-mono;
      name = "JetBrainsMono Nerd Font Mono";
    };
    sansSerif = {
      package = pkgs.nerd-fonts.jetbrains-mono;
      name = "JetBrainsMono Nerd Font";
    };
    propo = "JetBrainsMono Nerd Font Propo";
    # https://github.com/JetBrains/JetBrainsMono/wiki/OpenType-features#list-of-features
    features = [
      "calt=0" # ligatures off
      "clig=0" # contextual ligatures off
      "liga=0" # standard ligatures off
      "zero=1" # slashed zero
      "cv06=1" # 'm' smaller middle apex
      "cv07=1" # 'w' smaller middle apex
      "cv12=1" # 'u' spur
      "cv14=1" # '¢$' broken strikes
    ];
  };

  # Iosevka Term keeps arrows and geometric symbols one cell wide for terminals.
  # Iosevka already has a slashed zero. Its cv01-cv09 tags select digit styles.
  iosevka = {
    monospace = {
      package = pkgs.nerd-fonts.iosevka-term;
      name = "IosevkaTerm Nerd Font Mono";
    };
    sansSerif = {
      package = pkgs.nerd-fonts.iosevka;
      name = "Iosevka Nerd Font";
    };
    propo = "Iosevka Nerd Font Propo";
    features = [
      "calt=0" # ligatures off
    ];
  };
}

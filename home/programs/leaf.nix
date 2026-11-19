{
  config,
  lib,
  pkgs,
  ...
}:
let
  colors = config.lib.stylix.colors;
  hex = colors.withHashtag;
  channel = slot: c: lib.toInt colors."${slot}-rgb-${c}";
  # Mix `percent` of an accent slot into base00, like tokyonight's blend_bg. No slot holds these
  # tinted backgrounds, and without them diff add and delete lines share one background.
  blend =
    slot: percent:
    let
      mix = c: (channel slot c * percent + channel "base00" c * (100 - percent) + 50) / 100;
    in
    "rgb(${toString (mix "r")}, ${toString (mix "g")}, ${toString (mix "b")})";
  dark = config.stylix.polarity == "dark";

  # Leaf colors code tokens only with syntect's built-in themes, so `syntax` follows the polarity
  # instead of the palette. Keys follow the roles in upstream gruvbox.toml. Headings, bullets,
  # rules, tables, links, and inline code match tokyonight's render-markdown colors in nvim.
  theme = {
    base = if dark then "ocean" else "arctic";
    syntax = if dark then "base16-ocean.dark" else "base16-ocean.light";

    ui = {
      toc_bg = hex.base01;
      toc_border = hex.base02;
      content_bg = hex.base00;
      scrollbar_hover = hex.base0A;
      status_bg = hex.base01;
      status_separator = hex.base03;
      status_brand_fg = hex.base00;
      status_brand_bg = hex.base0A;
      status_filename_fg = hex.base05;
      status_filename_bg = hex.base02;
      status_watch_fg = hex.base0B;
      status_watch_bg = blend "base0B" 20;
      status_reloaded_fg = hex.base00;
      status_reloaded_bg = hex.base0B;
      status_search_fg = hex.base0A;
      status_search_bg = hex.base02;
      status_success_fg = hex.base0B;
      status_success_bg = blend "base0B" 20;
      status_warning_fg = hex.base0A;
      status_error_fg = hex.base08;
      status_error_bg = blend "base08" 20;
      status_shortcut_fg = hex.base04;
      status_percent_fg = hex.base0A;
      status_dot_fg = hex.base03;
      toc_hover_fg = hex.base06;
      toc_header_fg = hex.base04;
      toc_active_bg = hex.base02;
      toc_inactive_bg = hex.base01;
      toc_accent = hex.base09;
      toc_index_inactive = hex.base03;
      toc_primary_active = hex.base06;
      toc_primary_inactive = hex.base05;
      toc_secondary_inactive = hex.base03;
      toc_secondary_text_active = hex.base05;
      toc_secondary_text_inactive = hex.base04;
    };

    markdown = {
      search_highlight_bg = hex.base03;
      search_match_bg = hex.base0A;
      code_gutter = hex.base03;
      blockquote_marker = hex.base03;
      list_level_1 = hex.base09;
      list_level_2 = hex.base09;
      list_level_3 = hex.base09;
      ordered_list = hex.base09;
      table_border = hex.base09;
      table_separator = hex.base09;
      table_header = hex.base08;
      table_cell = hex.base05;
      heading_1 = hex.base0D;
      heading_2 = hex.base0A;
      heading_3 = hex.base0B;
      heading_4 = hex.base0C;
      heading_other = hex.base0E;
      heading_underline = hex.base02;
      code_frame = hex.base03;
      code_label = hex.base04;
      inline_code_fg = hex.base0D;
      inline_code_bg = hex.base02;
      rule = hex.base09;
      link_icon = hex.base0C;
      link_text = hex.base0C;
      link_hover = hex.base0D;
      blockquote_text = hex.base05;
      text = hex.base05;
      strong_text = hex.base06;
      latex_inline_fg = hex.base0E;
      latex_inline_bg = hex.base02;
      latex_block_fg = hex.base0E;
      mermaid_keyword = hex.base09;
      mermaid_arrow = hex.base0D;
      mermaid_label = hex.base0B;
      mermaid_block_fg = hex.base05;
      mark_fg = hex.base06;
      mark_bg = blend "base0A" 30;
      task_checked = hex.base0B;
      task_unchecked = hex.base0D;
      alert_note = hex.base0D;
      alert_tip = hex.base0B;
      alert_important = hex.base0E;
      alert_warning = hex.base0A;
      alert_caution = hex.base08;
      footnote_ref = hex.base0D;
      footnote_text = hex.base05;
    };

    diff = {
      add_fg = hex.base0B;
      add_bg = blend "base0B" 15;
      del_fg = hex.base08;
      del_bg = blend "base08" 15;
      context_fg = hex.base05;
      hunk_header_fg = hex.base0C;
      filename_fg = hex.base06;
      frame_fg = hex.base03;
      tree_active = hex.base0D;
      intra_add = blend "base0B" 30;
      intra_del = blend "base08" 30;
      meta_note_fg = hex.base0D;
      meta_note_bg = blend "base0D" 15;
      meta_note_sigil_fg = hex.base0D;
      file_separator_fg = hex.base05;
      tree_tag_change = hex.base09;
      tree_tag_renamed = hex.base0D;
    };
  };
in
{
  home.packages = [ pkgs.leaf-markdown-viewer ]; # terminal markdown viewer

  xdg.configFile = {
    "leaf/config.toml".source = config.lib.meta.mkDotfilesSymlink "leaf/.config/leaf/config.toml";
    "leaf/themes/stylix.toml".source = (pkgs.formats.toml { }).generate "leaf-stylix-theme.toml" theme;
  };
}

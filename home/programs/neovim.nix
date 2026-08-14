{
  inputs,
  config,
  pkgs,
  lib,
  theme,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
  luaString = value: builtins.toJSON value;
in
{
  home.packages =
    with pkgs;
    [
      # formatters
      alejandra
      autoflake
      black
      commitmsgfmt
      # eslint_d
      hclfmt
      isort
      json-repair
      mbake
      nixfmt
      # nodePackages.prettier
      svgo
      prettierd
      pybetter
      python312Packages.docformatter
      python3Packages.reorder-python-imports
      python312Packages.ssort
      shfmt
      sort-package-json
      stylua
      typstyle
      sql-formatter
      # yamlfix
      yamlfmt

      # linters
      # codespell
      dotenv-linter
      google-java-format
      hadolint
      luaPackages.luacheck
      markdownlint-cli
      # mypy
      # pylint
      # python3Packages.vulture
      shellcheck
      selene
      statix
      # sqlfluff
      yamllint

      # lsp
      basedpyright
      bash-language-server
      docker-compose-language-service
      dockerfile-language-server
      # elixir-ls
      # expert
      fish-lsp
      gopls
      harper
      jdt-language-server
      lua-language-server
      # marksman # NOTE: disabled because it depends on dotnet which requires swift 5.10.1 (broken on darwin)
      # mpls
      nil
      # nodePackages.typescript-language-server
      unstable.pyrefly
      # quick-lint-js
      # rust-analyzer
      superhtml
      tailwindcss-language-server
      taplo
      terraform-ls
      tinymist
      templ
      tflint
      unstable.ty
      typescript-go
      typos-lsp
      vscode-langservers-extracted # html, css, json, eslint
      # vtsls
      yaml-language-server

      # everything everywhere all at once
      eslint
      djlint
      html-tidy
      ruff
      stylelint
      # typescript

      # misc
      ctags-lsp
      universal-ctags
    ]
    ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [
      # qmlls (linux only, requires wayland)
      qt6.qtdeclarative
    ];

  programs.neovim = {
    enable = true;
    package =
      let
        nightly = inputs.neovim-nightly-overlay.packages.${pkgs.stdenv.hostPlatform.system}.default;
      in
      if pkgs.stdenv.hostPlatform.isDarwin then
        nightly.overrideAttrs (_: {
          # The nightly Tree-sitter test runner passes an invalid --listen value on Darwin.
          doCheck = false;
        })
      else
        nightly;
    sideloadInitLua = true;
    defaultEditor = true;
    withRuby = false;
    withPython3 = false;
    withNodeJs = false;
    extraPackages = with pkgs; [
      # dependencies
      gcc
      gnumake
      go
      tree-sitter
    ];
    extraLuaPackages = ps: [
      # ps.tiktoken_core
    ];
  };

  xdg.configFile = {
    "nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
    "stylix/neovim.lua".text = ''
      return {
          alias = ${luaString theme},
          base16 = {
              base00 = ${luaString colors.base00},
              base01 = ${luaString colors.base01},
              base02 = ${luaString colors.base02},
              base03 = ${luaString colors.base03},
              base04 = ${luaString colors.base04},
              base05 = ${luaString colors.base05},
              base06 = ${luaString colors.base06},
              base07 = ${luaString colors.base07},
              base08 = ${luaString colors.base08},
              base09 = ${luaString colors.base09},
              base0A = ${luaString colors.base0A},
              base0B = ${luaString colors.base0B},
              base0C = ${luaString colors.base0C},
              base0D = ${luaString colors.base0D},
              base0E = ${luaString colors.base0E},
              base0F = ${luaString colors.base0F},
          },
          semantic = {
              blue = ${luaString colors.base0D},
              yellow = ${luaString colors.base0A},
              green = ${luaString colors.base0B},
              teal = ${luaString colors.base0C},
              magenta = ${luaString colors.base0E},
              purple = ${luaString colors.base0E},
              orange = ${luaString colors.base09},
              red = ${luaString colors.base08},
              error = ${luaString colors.base08},
              hint = ${luaString colors.base0C},
              comment = ${luaString colors.base03},
              none = "NONE",
              fg = ${luaString colors.base05},
              fg_gutter = ${luaString colors.base02},
              bg_statusline = ${luaString colors.base01},
              bg = ${luaString colors.base00},
              bg_visual = ${luaString colors.base02},
              diff = {
                  add = ${luaString colors.base0B},
                  change = ${luaString colors.base0D},
                  delete = ${luaString colors.base08},
              },
          },
      }
    '';
  };
}

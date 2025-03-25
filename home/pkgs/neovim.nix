{
  inputs,
  config,
  pkgs,
  ...
}:
let
  vale-with-styles = pkgs.vale.withStyles (
    s: with s; [
      alex
      google
      microsoft
      proselint
      readability
      write-good
    ]
  );
in
{
  home.packages = with pkgs; [
    # formatters
    alejandra
    autoflake
    black
    commitmsgfmt
    # eslint_d
    hclfmt
    isort
    nixfmt-rfc-style
    nodePackages.prettier
    nodePackages.svgo
    prettierd
    pybetter
    python3Packages.docformatter
    python3Packages.reorder-python-imports
    shfmt
    sort-package-json
    python3Packages.ssort
    stylua
    sql-formatter
    yamlfix
    yamlfmt

    # linters
    # codespell
    dotenv-linter
    google-java-format
    hadolint
    luajitPackages.luacheck
    markdownlint-cli
    pylint
    shellcheck
    selene
    statix
    sqlfluff
    vale-with-styles
    yamllint

    # lsp
    # angular-language-server
    basedpyright
    bash-language-server
    docker-compose-language-service
    dockerfile-language-server-nodejs
    emmet-language-server
    fish-lsp
    gopls
    jdt-language-server
    lua-language-server
    marksman
    nil
    # nodePackages.typescript-language-server
    # pylyzer
    quick-lint-js
    rust-analyzer
    superhtml
    svelte-language-server
    tailwindcss-language-server
    taplo
    terraform-ls
    tflint
    typos-lsp
    vscode-langservers-extracted # html, css, json, eslint
    vtsls
    yaml-language-server

    # everything everywhere all at once
    djlint
    html-tidy
    ruff
    stylelint
    # typescript
  ];

  programs.neovim = {
    enable = true;
    package = inputs.neovim-nightly-overlay.packages.${pkgs.system}.default;
    defaultEditor = true;
    withRuby = false;
    withPython3 = false;
    withNodeJs = false;
    extraPackages = with pkgs; [
      # dependencies
      gcc
      gnumake
      # copilot.lua
      nodejs-slim
    ];
  };

  xdg.configFile = {
    "nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
    "vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  };
}

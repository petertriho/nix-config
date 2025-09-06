{
  inputs,
  config,
  pkgs,
  ...
}:
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
    mbake
    nixfmt-rfc-style
    nodePackages.prettier
    nodePackages.svgo
    prettierd
    pybetter
    python3Packages.docformatter
    python3Packages.reorder-python-imports
    python312Packages.ssort
    shfmt
    sort-package-json
    stylua
    typstyle
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
    mypy
    pylint
    python3Packages.vulture
    shellcheck
    selene
    statix
    sqlfluff
    yamllint

    # lsp
    basedpyright
    bash-language-server
    docker-compose-language-service
    dockerfile-language-server-nodejs
    emmet-language-server
    fish-lsp
    gopls
    harper
    jdt-language-server
    lua-language-server
    marksman
    mpls
    nil
    # nodePackages.typescript-language-server
    postgres-lsp
    unstable.pyrefly
    quick-lint-js
    # rust-analyzer
    superhtml
    svelte-language-server
    tailwindcss-language-server
    taplo
    terraform-ls
    tinymist
    tflint
    unstable.ty
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
      tree-sitter
      # copilot.lua
      nodejs-slim
    ];
    extraLuaPackages = ps: [
      # ps.tiktoken_core
    ];
  };

  xdg.configFile = {
    "nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
  };
}

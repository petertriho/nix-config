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
    # neovim
    # dependencies
    gcc
    gnumake
    # nvim-markdown-preview
    pandoc
    nodePackages.live-server

    # formatters
    alejandra
    autoflake
    black
    docformatter
    eslint_d
    isort
    nixfmt-rfc-style
    nodePackages.prettier
    nodePackages.svgo
    prettierd
    pybetter
    python3Packages.reorder-python-imports
    shfmt
    sort-package-json
    ssort
    stylua
    yamlfix
    yamlfmt

    # linters
    bandit
    codespell
    dotenv-linter
    google-java-format
    hadolint
    luajitPackages.luacheck
    markdownlint-cli
    refurb
    shellcheck
    selene
    statix
    vale-with-styles
    yamllint

    # lsp
    angular-language-server
    basedpyright
    bash-language-server
    biome
    emmet-language-server
    fish-lsp
    gopls
    htmx-lsp
    jdt-language-server
    lua-language-server
    marksman
    nil
    nodePackages.graphql-language-service-cli
    nodePackages.typescript-language-server
    quick-lint-js
    rust-analyzer
    superhtml
    svelte-language-server
    tailwindcss-language-server
    taplo
    terraform-ls
    tflint
    vscode-langservers-extracted # html, css, json, eslint
    yaml-language-server

    # everything everywhere all at once
    html-tidy
    ruff
    stylelint
  ];

  programs.neovim = {
    enable = true;
    package = inputs.neovim-nightly-overlay.packages.${pkgs.system}.default;
    defaultEditor = true;
    withRuby = false;
    withPython3 = false;
    withNodeJs = false;
  };

  xdg.configFile = {
    "nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
    "vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  };
}

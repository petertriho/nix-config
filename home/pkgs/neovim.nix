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
    commitmsgfmt
    docformatter
    eslint_d
    hclfmt
    isort
    nixfmt-rfc-style
    nodePackages.prettier
    nodePackages.svgo
    prettierd
    pybetter
    python3Packages.reorder-python-imports
    shfmt
    sort-package-json
    python3Packages.ssort
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
    docker-compose-language-service
    dockerfile-language-server-nodejs
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
    # pylyzer
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
    djlint
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

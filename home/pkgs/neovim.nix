{
  config,
  pkgs,
  ...
}: let
  valeWithStyles = pkgs.vale.withStyles (s:
    with s; [
      alex
      google
      microsoft
      proselint
      readability
      write-good
    ]);
in {
  home.packages = with pkgs; [
    neovim
    # dependencies
    fd
    fzf
    gcc
    gnumake
    ripgrep
    # formatters
    # TODO: add nginxbeautifier https://github.com/vasilevich/nginxbeautifier
    # TODO: add pybetter https://github.com/lensvol/pybetter
    # TODO: add ssort https://github.com/bwhmather/ssort
    alejandra
    autoflake
    black
    isort
    nodePackages.prettier
    nodePackages.svgo
    python312Packages.docformatter
    python312Packages.reorder-python-imports
    shfmt
    stylua

    # linters
    bandit
    codespell
    dotenv-linter
    eslint_d
    google-java-format
    hadolint
    markdownlint-cli
    nodePackages.cspell
    refurb
    shellcheck
    selene
    valeWithStyles

    # lsp
    # TODO: add fish-lsp https://github.com/ndonfris/fish-lsp
    basedpyright
    bash-language-server
    emmet-language-server
    gopls
    htmx-lsp
    jdt-language-server
    ltex-ls
    lua-language-server
    marksman
    nodePackages.graphql-language-service-cli
    nodePackages.typescript-language-server
    quick-lint-js
    rust-analyzer
    svelte-language-server
    tailwindcss-language-server
    taplo
    terraform-ls
    tflint
    vscode-langservers-extracted # html, css, json, eslint
    yaml-language-server

    # everything everywhere all at once
    html-tidy
    jq
    ruff
    stylelint
    yq-go
  ];

  xdg.configFile."nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
  xdg.configFile."code".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/code";
  xdg.configFile."vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  home.file.".vsnip".source = config.lib.meta.mkDotfilesSymlink "neovim/.vsnip";
}

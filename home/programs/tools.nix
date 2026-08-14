{
  config,
  pkgs,
  lib,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
in
{
  home.packages = with pkgs; [
    bun # JavaScript runtime
    chafa # terminal image viewer
    coreutils # GNU core utilities
    # dive # inspect docker images
    # drawio # diagramming tool
    dwt1-shell-color-scripts # shell color scripts collected by dt
    eza # ls replacement
    fd # find replacement
    figlet # ascii art text generator
    gcc # GNU Compiler Collection
    # glow # markdown viewer
    gnumake # GNU Make
    go-grip # markdown preview
    grex # regex generator
    parallel # run jobs in parallel
    pokemon-colorscripts # colorful scripts for Pokémon games
    # httpie # user-friendly HTTP client
    # stable.hurl # http client for testing APIs
    hyperfine # command-line benchmarking tool
    iperf3 # network performance measurement tool
    jq # JSON processor
    lsof # list open files
    lstr # tree replacement
    lynx # text-based web browser
    # mermaid-ascii # render mermaid diagrams in terminal
    mermaid-cli # render mermaid diagrams
    navi # interactive cheatsheet tool
    nix-auth # nix auth for providers (e.g. GitHub)
    nix-update # update Nix packages
    nurl # generate nix fetcher calls
    openssl # for generating certificates
    python3Packages.pipdeptree # view installed Python packages as a tree
    ripgrep # search tool
    (lib.hiPrio sem) # semantic version control; wins GNU Parallel's sem conflict
    television # fuzzy finder tui
    # tldr # help pages for command-line tools
    tree # directory listing
    # tuxedo # todo.txt list manager
    typst # typesetting system
    unzip # unzip files
    update-nix-fetchgit # update fetchgit URLs in Nix files
    watchexec # run commands when files change
    unstable.witr # why is this running?
    wget # network downloader
    yq-go # YAML processor
    zip # zip files
    zoxide # smarter cd command
  ];

  home.sessionVariables = {
    FIGLET_FONTDIR = "${pkgs.figlet-fonts}/share/figlet";
    GROFF_NO_SGR = "1"; # fix colored-man-pages plugin colors
    _ZO_EXCLUDE_DIRS =
      let
        # Helper function to generate both dir and dir/** patterns
        excludeDir = dir: [
          "**/${dir}"
          "**/${dir}/**"
        ];

        # Git worktree dirs to exclude
        gitDirs = [
          "*__worktrees"
          "dev"
          "hotfix"
          "main"
          "releases"
          "work"
        ];

        # Development directories to exclude
        devDirs = [
          ".git" # Git metadata
          ".venv" # Python virtual env (hidden)
          "__pycache__" # Python bytecode
          "build" # Build artifacts
          "coverage" # Test coverage
          "dist" # Distribution builds
          "node_modules" # Node.js dependencies
          "target" # Rust/Cargo build
          "temp" # Temporary files
          "tmp" # Temporary files
          "vendor" # Dependencies
          "venv" # Python virtual env
        ];

        allExcludes = lib.concatMap excludeDir (gitDirs ++ devDirs);
      in
      lib.strings.concatStringsSep ":" allExcludes;

    _ZO_FZF_OPTS = lib.strings.concatStringsSep " " [
      "$FZF_DEFAULT_OPTS"
      "--keep-right"
      "--exit-0"
      "--select-1"
      "--preview='command eza {2..}'"
      "--preview-window=bottom"
    ];
    SEM_NO_TELEMETRY = "1";
  };

  programs = {
    bat.enable = true;
    btop.enable = true;
    fzf = {
      enable = true;
      enableFishIntegration = false;
      defaultOptions = [
        "--ansi"
        "--border"
        "--cycle"
        "--reverse"
        "--height=80%"
        # Plain preview text otherwise inherits the theme's muted list fg.
        "--color=preview-fg:-1"
        "--bind=ctrl-l:toggle-preview"
        "--bind=ctrl-d:preview-half-page-down,ctrl-u:preview-half-page-up"
        "--bind=alt-a:select-all,alt-d:deselect-all"
      ];
    };
  };

  xdg.configFile."television/config.toml".source =
    config.lib.meta.mkDotfilesSymlink "television/.config/television/config.toml";
  xdg.configFile."television/themes/stylix.toml".text = ''
    background = '${colors.base00}'
    border_fg = '${colors.base03}'
    text_fg = '${colors.base16}'
    dimmed_text_fg = '${colors.base05}'
    input_text_fg = '${colors.base12}'
    result_count_fg = '${colors.base12}'
    result_name_fg = '${colors.base16}'
    result_line_number_fg = '${colors.base13}'
    result_value_fg = '${colors.base05}'
    selection_fg = '${colors.base14}'
    selection_bg = '${colors.base03}'
    match_fg = '${colors.base12}'
    preview_title_fg = '${colors.base17}'
    channel_mode_fg = '${colors.base10}'
    channel_mode_bg = '${colors.base0B}'
    remote_control_mode_fg = '${colors.base10}'
    remote_control_mode_bg = '${colors.base0A}'
    action_picker_mode_fg = '${colors.base10}'
    action_picker_mode_bg = '${colors.base0E}'
    send_to_channel_mode_fg = '${colors.base0C}'
  '';
}

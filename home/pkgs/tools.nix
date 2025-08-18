{
  config,
  pkgs,
  lib,
  ...
}:
{
  home.packages = with pkgs; [
    bat # cat replacement with syntax highlighting
    btop # better htop
    cht-sh # command-line cheat sheets
    coreutils # GNU core utilities
    dive # inspect docker images
    eza # ls replacement
    fd # find replacement
    fzf # fuzzy finder
    gcc # GNU Compiler Collection
    gnumake # GNU Make
    git-gone # git garbage collector
    glow # markdown viewer
    httpie # user-friendly HTTP client
    hurl # http client for testing APIs
    hyperfine # command-line benchmarking tool
    iperf3 # network performance measurement tool
    jq # JSON processor
    lsof # list open files
    lstr # tree replacement
    lynx # text-based web browser
    navi # interactive cheatsheet tool
    nix-update # update Nix packages
    nurl # generate nix fetcher calls
    openssl # for generating certificates
    python3Packages.pipdeptree # view installed Python packages as a tree
    ripgrep # search tool
    tldr # simplified man pages
    typst # typesetting system
    unzip # unzip files
    update-nix-fetchgit # update fetchgit URLs in Nix files
    watchexec # run commands when files change
    yq-go # YAML processor
    zip # zip files
    zoxide # smarter cd command
  ];

  home.sessionVariables = {
    FZF_DEFAULT_OPTS = lib.strings.concatStringsSep " " [
      "--ansi"
      "--exact"
      "--border"
      "--cycle"
      "--reverse"
      "--height='80%'"
      "--bind='ctrl-l:toggle-preview'"
      "--bind='ctrl-d:preview-half-page-down,ctrl-u:preview-half-page-up'"
      "--bind='alt-a:select-all,alt-d:deselect-all'"
      "--color='dark'"
      "--color='border:7,fg:-1,bg:-1,hl:5,fg+:7,bg+:8,hl+:5'"
      "--color='info:6,prompt:2,pointer:2,marker:3,spinner:1,header:4'"
    ];
    _ZO_EXCLUDE_DIRS = lib.strings.concatStringsSep ":" [
      "**/main"
      "**/work"
      "**/hotfix"
    ];
    _ZO_FZF_OPTS = lib.strings.concatStringsSep " " [
      "$FZF_DEFAULT_OPTS"
      "--keep-right"
      "--exit-0"
      "--select-1"
      "--preview='command eza {2..}'"
      "--preview-window=bottom"
    ];
  };

  xdg.configFile."bat".source = config.lib.meta.mkDotfilesSymlink "bat/.config/bat";
}

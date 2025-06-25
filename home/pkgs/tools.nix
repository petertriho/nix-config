{
  pkgs,
  lib,
  ...
}:
{
  home.packages = with pkgs; [
    btop # better htop
    cht-sh # command-line cheat sheets
    coreutils # GNU core utilities
    csvkit # command-line CSV toolkit
    dive # inspect docker images
    eza # ls replacement
    fd # find replacement
    fx # json viewer
    fzf # fuzzy finder
    git-gone # git garbage collector
    glow # markdown viewer
    gron # make JSON greppable
    httpie # user-friendly HTTP client
    stable.hurl # http client for testing APIs
    hyperfine # command-line benchmarking tool
    iperf3 # network performance measurement tool
    jq # JSON processor
    lsof # list open files
    lstr # tree replacement
    lynx # text-based web browser
    navi # interactive cheatsheet tool
    nurl # generate nix fetcher calls
    openssl # for generating certificates
    python3Packages.pgcli # PostgreSQL CLI with autocompletion
    python3Packages.pipdeptree # view installed Python packages as a tree
    ripgrep # search tool
    sqlite # command-line SQLite client
    sqlite-web # web-based SQLite client
    tabiew # csv data viewer
    tldr # simplified man pages
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
    _ZO_FZF_OPTS = lib.strings.concatStringsSep " " [
      "$FZF_DEFAULT_OPTS"
      "--keep-right"
      "--exit-0"
      "--select-1"
      "--preview='command eza {2..}'"
      "--preview-window=bottom"
    ];
  };
}

{
  pkgs,
  lib,
  ...
}:
{
  home.packages = with pkgs; [
    btop
    cht-sh
    coreutils
    dive
    eza
    fd
    fx
    fzf
    git-gone
    glow
    # python3Packages.howdoi
    httpie
    stable.hurl
    hyperfine
    iperf3
    jq
    lsof
    lstr
    lynx
    navi
    nurl
    openssl
    python3Packages.pgcli
    python3Packages.pipdeptree
    ripgrep
    sqlite
    sqlite-web
    tabiew
    tldr
    unzip
    update-nix-fetchgit
    watchexec
    yq-go
    zip
    zoxide
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

{
  pkgs,
  lib,
  config,
  ...
}: let
  abbreviation-tips = {
    name = "abbreviation-tips";
    src = pkgs.fetchFromGitHub {
      owner = "gazorby";
      repo = "fish-abbreviation-tips";
      rev = "v0.7.0";
      hash = "sha256-F1t81VliD+v6WEWqj1c1ehFBXzqLyumx5vV46s/FZRU=";
    };
  };

  replay = {
    name = "replay";
    src = pkgs.fetchFromGitHub {
      owner = "jorgebucaran";
      repo = "replay.fish";
      rev = "1.2.1";
      hash = "sha256-bM6+oAd/HXaVgpJMut8bwqO54Le33hwO9qet9paK1kY=";
    };
  };

  upto = {
    name = "upto";
    src = pkgs.fetchFromGitHub {
      owner = "Markcial";
      repo = "upto";
      rev = "2d1f35453fb55747d50da8c1cb1809840f99a646";
      hash = "sha256-Lv2XtP2x9dkIkUUjMBWVpAs/l55Ztu7gIjKYH6ZzK4s=";
    };
  };
in {
  home.packages = with pkgs; [
    delta
    # dependencies
    eza
    fd
    fzf
    zoxide
  ];

  programs.fish = {
    enable = true;
    plugins = with pkgs; [
      # {
      #   name = "async-prompt";
      #   src = fishPlugins.async-prompt.src;
      # }
      {
        name = "autopair";
        src = fishPlugins.autopair.src;
      }
      {
        name = "colored-man-pages";
        src = fishPlugins.colored-man-pages.src;
      }
      {
        name = "forgit";
        src = fishPlugins.forgit.src;
      }
      {
        name = "fzf-fish";
        src = fishPlugins.fzf-fish.src;
      }
      {
        name = "puffer";
        src = fishPlugins.puffer.src;
      }
      {
        name = "sponge";
        src = fishPlugins.sponge.src;
      }
      abbreviation-tips
      replay
      upto
    ];
    shellAbbrs = {
      aa = "arch -arm64";
      af = "afish";
      ax = "arch -x86_64";
      d = "docker";
      dc = "docker compose";
      dcd = "docker compose down --remove-orphans";
      dcl = "docker compose logs -f -t --tail=100";
      dcp = "docker compose -p (git_repo_name)";
      dcpd = "docker compose -p (git_repo_name) down --remove-orphans";
      dcpl = "docker compose -p (git_repo_name) logs -f -t --tail=100";
      dcpr = "docker compose -p (git_repo_name) restart";
      dcpu = "docker compose -p (git_repo_name) up -d";
      dcu = "docker compose up -d";
      e = "eza --classify";
      el = "eza --classify --long --header --all --git";
      et = "eza --classify --tree --level=3";
      g = "git";
      gaa = "git add --all";
      gb = "git branch";
      gbrd = "git branch -D";
      gbs = "git_branch_set_upstream";
      gbu = "git branch --unset-upstream";
      gc = "git commit";
      gcam = "git commit -am";
      gcl = "git clone";
      gclb = "git_clone_bare";
      gco = "git checkout";
      gcob = "git checkout -b";
      gdi = "git diff";
      gdt = "git difftool";
      gf = "git fetch";
      gl = "begin; set -lx GIT_EXTERNAL_DIFF difft; git log -p --ext-diff; end";
      gm = "git merge";
      gma = "git merge --abort";
      gmt = "git mergetool";
      gpl = "git pull";
      gplo = "git pull origin";
      gps = "git push";
      gpsf = "git push --force-with-lease";
      gr = "git rebase";
      gra = "git rebase --abort";
      grbc = "git rebase --continue";
      gri = "git rebase --interactive";
      grf = "git reflog";
      grs = "git reset";
      grs1 = "git reset --soft HEAD@{1}";
      grsh = "git reset --hard";
      grss = "git reset --soft";
      gs = "git status";
      gst = "git stash";
      gsta = "git stash apply";
      gstp = "git stash pop";
      gsw = "git switch";
      gw = "git worktree";
      gwa = "git worktree add";
      gwl = "git worktree list";
      gwm = "git worktree move";
      gwr = "git worktree remove";
      k = "kubectl";
      ll = "ls -la";
      mk = "minikube";
      n = "nix";
      ncg = "nix-collect-garbage --delete-older-than";
      nrs = "sudo nixos-rebuild switch --flake ~/.nix-config";
      ns = "nix search nixpkgs";
      pv = "python -m venv .venv";
      rmf = "rm -rf";
      rv = "rm -rf .venv";
      sv = "source .venv/bin/activate.fish";
      t = "tmux";
      ta = "tmux attach-session -t";
      task = "./Taskfile";
      tf = "terraform";
      tk = "tmux kill-session -t";
      tl = "tmux list-sessions";
      tn = "tmux new-session -s";
      xf = "xfish";
    };
    shellAliases = {
      v = "nvim";
    };
    interactiveShellInit = builtins.readFile ../../dotfiles/fish/.config/fish/config.fish;
  };

  xdg.configFile."fish/functions".source = config.lib.meta.mkDotfilesSymlink "fish/.config/fish/functions";
  xdg.configFile."fish/conf.d/00_prompt.fish".source = config.lib.meta.mkDotfilesSymlink "fish/.config/fish/conf.d/00_prompt.fish";
}

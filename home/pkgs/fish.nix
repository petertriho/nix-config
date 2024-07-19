{
  pkgs,
  config,
  ...
}: let
  abbreviation-tips = {
    name = "abbreviation-tips";
    src = pkgs.fetchFromGitHub {
      owner = "gazorby";
      repo = "fish-abbreviation-tips";
      rev = "8ed76a62bb044ba4ad8e3e6832640178880df485";
      sha256 = "05b5qp7yly7mwsqykjlb79gl24bs6mbqzaj5b3xfn3v2b7apqnqp";
    };
  };

  async-prompt-fork = {
    name = "async-prompt";
    src = pkgs.fetchFromGitHub {
      owner = "petertriho";
      repo = "fish-async-prompt";
      rev = "f8dadd567f63517d066a58762154cc3a9791ed38";
      sha256 = "0gky4x3fr1xmgahafrb469l6mkrci77p0w3a6s8jk3wxrv18y94m";
    };
  };

  colored-man-pages-fork = {
    name = "colored-man-pages";
    src = pkgs.fetchFromGitHub {
      owner = "petertriho";
      repo = "colored_man_pages.fish";
      rev = "d6352e9b88bb9941e12c839bc8e07ddfa751dab1";
      sha256 = "0ybg88s6ig6cnwnih2m1dbisj9xhydsl6f659bc6rc28xg9idri3";
    };
  };

  replay = {
    name = "replay";
    src = pkgs.fetchFromGitHub {
      owner = "jorgebucaran";
      repo = "replay.fish";
      rev = "d2ecacd3fe7126e822ce8918389f3ad93b14c86c";
      sha256 = "1n2xji4w5k1iyjsvnwb272wx0qh5jfklihqfz0h1a1bd3zp3sd2g";
    };
  };

  upto = {
    name = "upto";
    src = pkgs.fetchFromGitHub {
      owner = "Markcial";
      repo = "upto";
      rev = "2d1f35453fb55747d50da8c1cb1809840f99a646";
      sha256 = "12rbffk1z61j4bhfxdjrksbky2x4jlak08s5j44dkxdizns9gz9f";
    };
  };
in {
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
      # {
      #   name = "colored-man-pages";
      #   src = fishPlugins.colored-man-pages.src;
      # }
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
      async-prompt-fork
      colored-man-pages-fork
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
      de = "devenv";
      deg = "devenv gc";
      dei = "devenv init";
      deif = "devenv info";
      des = "devenv search";
      desh = "devenv shell";
      det = "devenv test";
      deu = "devenv up";
      deud = "devenv update";
      di = "direnv";
      dia = "direnv allow";
      dib = "direnv block";
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
      grf = "git reflog";
      gri = "git rebase --interactive";
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
      ndh = "nix-direnv-helper";
      ndr = "nix-direnv-reload";
      nfu = "nix flake update";
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
      tnz = "tmux-new-zoxide";
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

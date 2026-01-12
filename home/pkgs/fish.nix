{
  pkgs,
  config,
  lib,
  ...
}:
{
  programs.fish = {
    enable = true;
    generateCompletions = false;
    plugins =
      with pkgs.fishPlugins;
      lib.lists.forEach
        [
          autopair
          colored-man-pages
          forgit
          fzf-fish
          puffer
          sponge
          upto
        ]
        (x: {
          name = x.pname;
          inherit (x) src;
        })
      ++ [
        # {
        #   name = "shellock";
        #   src = pkgs.shellock;
        # }
      ];
    shellAbbrs = {
      acs = "aws configure sso";
      ap = "export AWS_PROFILE=(aws-profile)";
      asl = "aws sso login";
      d = "docker";
      dc = "docker compose";
      dcd = "docker compose down --remove-orphans";
      dcl = "docker compose logs -f -t --tail=100";
      dcp = "docker compose -p (git-repo-name)";
      dcpd = "docker compose -p (git-repo-name) down --remove-orphans";
      dcpl = "docker compose -p (git-repo-name) logs -f -t --tail=100";
      dcpr = "docker compose -p (git-repo-name) restart";
      dcpu = "docker compose -p (git-repo-name) up -d";
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
      dsp = "docker system prune";
      dspa = "docker system prune --all --volumes";
      e = "eza --classify";
      el = "eza --classify --long --header --all --git";
      et = "eza --classify --tree --level=3";
      fp = "free-port";
      fuc = "fish_update_completions";
      g = "git";
      gaa = "git add --all";
      gb = "git branch";
      gbrd = "git branch -D";
      gbs = "git-branch-set-upstream";
      gbu = "git branch --unset-upstream";
      gc = "git commit";
      gcam = "git commit -am";
      gcl = "git clone";
      gclb = "git-clone-bare";
      gcls = "git-clone-special";
      gco = "git checkout";
      gcob = "git checkout -b";
      gcd = "git-checkout-default";
      gdb = "git-default-branch";
      gdi = "git diff";
      gdt = "git difftool";
      gf = "git fetch";
      gfr = "git config core.fsmonitor rs-git-fsmonitor";
      gfs = "git config core.fsmonitor true";
      gg = "git-gone";
      gl = "begin; set -lx GIT_EXTERNAL_DIFF difft; git log -p --ext-diff; end";
      gm = "git merge";
      gma = "git merge --abort";
      gmt = "git mergetool";
      gpl = "git pull";
      gplo = "git pull origin";
      gpls = "git stash && git pull && git stash pop";
      gps = "git push";
      gpsf = "git push --force-with-lease";
      gr = "git rebase";
      gra = "git rebase --abort";
      grbc = "git rebase --continue";
      grd = "git rebase (git-default-branch)";
      grf = "git reflog";
      gri = "git rebase --interactive";
      grs = "git reset";
      grs1 = "git reset --soft HEAD@{1}";
      grsh = "git reset --hard";
      grss = "git reset --soft";
      gsa = "git status";
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
      kc = "kubie ctx";
      ll = "ls -la";
      mk = "minikube";
      n = "nix";
      na = "navi";
      nac = "navi --cheatsh";
      nat = "navi --tldr";
      ncg = "nix-collect-garbage --delete-older-than";
      ndh = "nix-direnv-helper";
      ndr = "nix-direnv-reload";
      nfu = "nix flake update";
      nr = "nix run nixpkgs#";
      nrs = lib.strings.concatStringsSep " " [
        "sudo"
        (if pkgs.stdenv.isDarwin then "darwin-rebuild" else "nixos-rebuild")
        "switch --flake ~/.nix-config"
      ];
      ns = "nix search nixpkgs";
      oc = "opencode";
      oi = "openspec init";
      oa = "openspec archive";
      oas = "openspec archive --skip-specs";
      ol = "openspec list";
      pv = "python -m venv .venv";
      q = "amazon-q";
      rmf = "rm -rf";
      rv = "rm -rf .venv";
      sc = "sesh-connect-fzf";
      sl = "sesh list";
      sv = "source .venv/bin/activate.fish";
      sw = "session-wizard";
      t = "tmux";
      ta = "tmux attach-session -t";
      task = "./Taskfile";
      tf = "terraform";
      tk = "tmux kill-session -t";
      tl = "tmux list-sessions";
      tn = "tmux new-session -s";
      tnz = "tmux-new-zoxide";
      ysdk = "yarn dlx @yarnpkg/sdks base"; # https://yarnpkg.com/getting-started/editor-sdks#neovim-native-lsp
    }
    // (
      if pkgs.stdenv.isDarwin then
        {
          aa = "arch -arm64";
          af = "afish";
          ax = "arch -x86_64";
          c = "colima";
          xf = "xfish";
        }
      else
        { }
    );
    shellAliases = {
      v = "nvim";
    };
    functions =
      let
        grcPluginExecs = [
          "cat"
          "cvs"
          "df"
          "diff"
          "dig"
          "gcc"
          "g++"
          "ls"
          "ifconfig"
          "make"
          "mount"
          "mtr"
          "netstat"
          "ping"
          "ps"
          "tail"
          "traceroute"
          "wdiff"
          "blkid"
          "du"
          "dnf"
          "docker"
          "docker-compose"
          "docker-machine"
          "env"
          "id"
          "ip"
          "iostat"
          "journalctl"
          "kubectl"
          "last"
          "lsattr"
          "lsblk"
          "lspci"
          "lsmod"
          "lsof"
          "getfacl"
          "getsebool"
          "ulimit"
          "uptime"
          "nmap"
          "fdisk"
          "findmnt"
          "free"
          "semanage"
          "sar"
          "ss"
          "sysctl"
          "systemctl"
          "stat"
          "showmount"
          "tcpdump"
          "tune2fs"
          "vmstat"
          "w"
          "who"
          "sockstat"
        ];
        grcFunctions = builtins.listToAttrs (
          map (executable: {
            name = executable;
            value = ''
              if isatty 1
                  grc ${executable} $argv
              else
                  eval command ${executable} $argv
              end
            '';
          }) grcPluginExecs
        );
        fishFunctions = [
          "set-nextcloud"
          "set-theme"
        ];
        customFunctions = builtins.listToAttrs (
          map (func: {
            name = func;
            value = builtins.readFile (../../dotfiles/fish/.config/fish/functions + "/${func}.fish");
          }) fishFunctions
        );
      in
      customFunctions // grcFunctions;
    interactiveShellInit = builtins.readFile ../../dotfiles/fish/.config/fish/config.fish;
  };

  home.packages = with pkgs; [
    grc
    # shellock
    vivid
  ];

  home.activation.setTheme = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    PATH="${
      lib.makeBinPath (
        with pkgs;
        [
          fish
          vivid
        ]
      )
    }:$PATH" run /usr/bin/env fish --no-config ${
      config.lib.meta.configPath + "/dotfiles/fish/.config/fish/functions/set-theme.fish"
    }
  '';

  xdg.configFile =
    let
      fishConfFiles = [
        "00-prompt.fish"
        "01-forgit.fish"
        "02-theme.fish"
      ];
    in
    builtins.listToAttrs (
      map (file: {
        name = "fish/conf.d/${file}";
        value.source = config.lib.meta.mkDotfilesSymlink "fish/.config/fish/conf.d/${file}";
      }) fishConfFiles
    )
    // {
      "vivid".source = config.lib.meta.mkDotfilesSymlink "vivid/.config/vivid";
    };
}

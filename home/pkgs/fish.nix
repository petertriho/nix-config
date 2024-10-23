{
  pkgs,
  config,
  lib,
  osConfig,
  ...
}:
{
  programs.fish = {
    enable = true;
    plugins =
      with pkgs.fishPlugins;
      lib.lists.forEach
        [
          abbreviation-tips
          async-prompt-fork
          autopair
          colored-man-pages-fork
          forgit
          fzf-fish
          puffer
          replay
          sponge
          upto
        ]
        (x: {
          name = x.pname;
          inherit (x) src;
        });
    shellAbbrs =
      {
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
        dsp = "docker system prune";
        dspa = "docker system prune --all --volumes";
        e = "eza --classify";
        el = "eza --classify --long --header --all --git";
        et = "eza --classify --tree --level=3";
        fp = "free-port";
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
        gcls = "git_clone_special";
        gco = "git checkout";
        gcob = "git checkout -b";
        gdi = "git diff";
        gdt = "git difftool";
        gf = "git fetch";
        gg = "git-gone";
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
        nrs = lib.strings.concatStringsSep " " [
          (if pkgs.stdenv.isDarwin then "darwin-rebuild" else "sudo nixos-rebuild")
          "switch --flake ~/.nix-config"
        ];
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
    # https://github.com/LnL7/nix-darwin/issues/122#issuecomment-1659465635
    loginShellInit = lib.mkIf pkgs.stdenv.isDarwin (
      let
        dquote = str: "\"" + str + "\"";
        makeBinPathList = map (path: path + "/bin");
        brewBinPathList = lib.concatMapStringsSep " " dquote (
          with osConfig.environment.variables;
          [
            "${HOMEBREW_PREFIX}/bin"
            "${HOMEBREW_PREFIX}/sbin"
          ]
        );
        binPathList = lib.concatMapStringsSep " " dquote (makeBinPathList osConfig.environment.profiles);
      in
      ''
        fish_add_path --move --prepend --path ${brewBinPathList}
        fish_add_path --move --prepend --path ${binPathList}
        set fish_user_paths $fish_user_paths
      ''
    );
    interactiveShellInit = builtins.readFile ../../dotfiles/fish/.config/fish/config.fish;
  };

  xdg.configFile."fish/functions".source = config.lib.meta.mkDotfilesSymlink "fish/.config/fish/functions";
  xdg.configFile."fish/conf.d/00_prompt.fish".source = config.lib.meta.mkDotfilesSymlink "fish/.config/fish/conf.d/00_prompt.fish";
}

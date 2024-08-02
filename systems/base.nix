{
  inputs,
  outputs,
  config,
  pkgs,
  lib,
  ...
}:
{
  imports = [ inputs.home-manager.nixosModules.home-manager ];

  nix = {
    gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      trusted-users = [
        "root"
        "@wheel"
      ];
      warn-dirty = false;
      auto-optimise-store = true;
    };
  };

  environment = {
    systemPackages = with pkgs; [
      ((vim_configurable.override { }).customize {
        vimrcConfig.customRC = ''
          set hlsearch
          set ignorecase
          set incsearch
          set number
          set noswapfile

          set autoread
          set backspace=indent,eol,start
          set laststatus=2
          set lazyredraw
          set relativenumber
          set ruler
          set wildmenu

          filetype plugin indent on
          syntax on
        '';
      })
    ];
    variables.EDITOR = "vim";
  };

  programs.fish.enable = true;
  programs.bash = {
    interactiveShellInit = ''
      if [[ $(${pkgs.procps}/bin/ps --no-header --pid=$PPID --format=comm) != "fish" && -z ''${BASH_EXECUTION_STRING} ]]
       then
         shopt -q login_shell && LOGIN_OPTION='--login' || LOGIN_OPTION=""
         exec ${pkgs.fish}/bin/fish $LOGIN_OPTION
      fi
    '';
  };

  users.users.peter = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs;
    };
  };

  system.stateVersion = lib.mkDefault "24.05";
}

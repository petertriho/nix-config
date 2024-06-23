{
  inputs,
  outputs,
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    inputs.home-manager.nixosModules.home-manager
  ];

  nix.settings.experimental-features = ["nix-command" "flakes"];
  environment = {
    systemPackages = with pkgs; [
      ((vim_configurable.override {}).customize {
        vimrcConfig.customRC = ''
          set hlsearch
          set ignorecase
          set incsearch
          set number
          set noswapfile

          set autoread
          set lazyredraw
          set relativenumber

          filetype plugin on
          filetype indent on
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

  nixpkgs.overlays = [
    inputs.neovim-nightly-overlay.overlays.default
  ];

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs;
    };
  };
}

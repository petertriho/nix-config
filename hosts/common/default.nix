{
  inputs,
  outputs,
  config,
  pkgs,
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

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../../home/peter/${config.networking.hostName}.nix;
  };
}

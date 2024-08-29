{
  inputs,
  outputs,
  pkgs,
  pkgs-stable,
  config,
  ...
}:
{
  imports = [
    outputs.systemModules.helpers
  ];

  nix = {
    gc = {
      automatic = true;
      options = "--delete-older-than 30d";
    };
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      warn-dirty = false;
      auto-optimise-store = true;
    };
  };

  environment = {
    systemPackages = with pkgs; [
      ((vim_configurable.override { }).customize {
        vimrcConfig.customRC =
          # vim
          ''
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

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    users.peter = import ../home/${config.networking.hostName}.nix;
    extraSpecialArgs = {
      inherit inputs outputs pkgs-stable;
    };
  };
}

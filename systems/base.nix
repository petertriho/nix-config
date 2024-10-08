{
  inputs,
  outputs,
  pkgs,
  pkgs-stable,
  config,
  lib,
  ...
}:
{
  imports = [
    (with inputs.home-manager; if pkgs.stdenv.isLinux then nixosModules else darwinModules).home-manager
    outputs.systemModules.helpers
    outputs.options
  ];

  options = with lib; {
    user = mkOption {
      type = types.str;
      description = "Username";
    };
    homePath = mkOption {
      type = types.str;
      description = "User's home path";
      default = strings.concatStrings [
        (if pkgs.stdenv.isLinux then "/home/" else "/Users/")
        config.user
      ];
    };
  };

  config = {
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
        trusted-users = [
          "root"
          (if pkgs.stdenv.isLinux then "@wheel" else "@admin")
        ];
        substituters = [
          "https://nix-community.cachix.org"
        ];
        trusted-public-keys = [
          "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
        ];
      };
    };
    environment = {
      systemPackages = with pkgs; [
        (
          (vim-full.override (
            {
              luaSupport = false;
              perlSupport = false;
              pythonSupport = false;
              rubySupport = false;
            }
            // (
              if pkgs.stdenv.isDarwin then
                {
                  darwinSupport = true;
                  guiSupport = false;
                }
              else
                { }
            )
          )).customize
          {
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
          }
        )
      ];
      variables.EDITOR = "vim";
    };

    home-manager = {
      useGlobalPkgs = true;
      useUserPackages = true;
      users.${config.user} = import ../home/${config.networking.hostName}.nix;
      extraSpecialArgs = {
        inherit inputs outputs pkgs-stable;
      };
    };
  };
}

{ pkgs, ... }:
{
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
}

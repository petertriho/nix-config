{
  stdenv,
  vim-full,
  ...
}:
(
  (vim-full.override (
    {
      luaSupport = false;
      perlSupport = false;
      pythonSupport = false;
      rubySupport = false;
    }
    // (
      if stdenv.isDarwin then
        {
          darwinSupport = true;
          guiSupport = false;
        }
      else
        { }
    )
  )).customize
  {
    vimrcConfig.customRC = builtins.readFile ./.vimrc;
  }
)

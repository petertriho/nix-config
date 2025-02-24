{
  tmuxPlugins,
  fetchFromGitHub,
  ...
}:
tmuxPlugins.mkTmuxPlugin {
  pluginName = "tmuxcolors";
  version = "unstable-2025-02-23";
  src = fetchFromGitHub {
    owner = "tinted-theming";
    repo = "tinted-tmux";
    rev = "b6c7f46c8718cc484f2db8b485b06e2a98304cd0";
    sha256 = "0r51vjk4hmrrdnqgxpi7ncni8vv92if2alklbf5hdk67bm8mzszx";
  };
}

{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "colored-man-pages";
  version = "unstable-2024-07-18";

  src = fetchFromGitHub {
    owner = "petertriho";
    repo = "colored_man_pages.fish";
    rev = "d6352e9b88bb9941e12c839bc8e07ddfa751dab1";
    sha256 = "0ybg88s6ig6cnwnih2m1dbisj9xhydsl6f659bc6rc28xg9idri3";
  };
}

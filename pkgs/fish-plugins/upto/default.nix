{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "upto";
  version = "0-unstable-2026-10-20";

  src = fetchFromGitHub {
    owner = "Markcial";
    repo = "upto";
    rev = "7c870c66001a13ddea072dccdd16510d59439fe4";
    sha256 = "sha256-FVjSu7wh09pBeFO3YlJ+wKl/IRzklDt95YAT04rwJJc=";
  };
}

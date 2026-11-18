{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "upto";
  version = "0-unstable-2026-11-17";

  src = fetchFromGitHub {
    owner = "Markcial";
    repo = "upto";
    rev = "631138eb3655d52f4cb8cfbc1a19b2d71dc70d7f";
    sha256 = "sha256-LuPY/q5d1kuEfFVqNrWCRIPvEsHhpravZ6BNN3SKo0c=";
  };
}

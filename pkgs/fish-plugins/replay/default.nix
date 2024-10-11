{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "replay";
  version = "unstable-2024-07-01";

  src = fetchFromGitHub {
    owner = "jorgebucaran";
    repo = "replay.fish";
    rev = "d2ecacd3fe7126e822ce8918389f3ad93b14c86c";
    sha256 = "1n2xji4w5k1iyjsvnwb272wx0qh5jfklihqfz0h1a1bd3zp3sd2g";
  };
}

{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "upto";
  version = "unstable-2018-12-19";

  src = fetchFromGitHub {
    owner = "Markcial";
    repo = "upto";
    rev = "2d1f35453fb55747d50da8c1cb1809840f99a646";
    sha256 = "12rbffk1z61j4bhfxdjrksbky2x4jlak08s5j44dkxdizns9gz9f";
  };
}

{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "async-prompt";
  version = "unstable-2025-06-25";

  src = fetchFromGitHub {
    owner = "petertriho";
    repo = "fish-async-prompt";
    rev = "4b57eff4f07cafb5f1d026096eeef102bf413d45";
    sha256 = "08f7qa8rn794rr6rxkphlwlcsrx90fr4nvpqy48cwpdrbqxfc0y6";
  };
}

{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "async-prompt";
  version = "unstable-2024-07-19";

  src = fetchFromGitHub {
    owner = "petertriho";
    repo = "fish-async-prompt";
    rev = "9ea45bc236c9e549ab8781195f6b7fd81d9f78a4";
    sha256 = "0hwji3h6cx93agq199f4rjdnp97nzsvasnij7nrx3ljrisd8bfav";
  };
}

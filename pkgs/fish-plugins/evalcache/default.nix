{
  fishPlugins,
  fetchFromGitHub,
  ...
}:
fishPlugins.buildFishPlugin {
  pname = "evalcache";
  version = "unstable-2025-03-09";

  src = fetchFromGitHub {
    owner = "kyohsuke";
    repo = "fish-evalcache";
    rev = "2b236c917e94879b98bbd62b93948cb0ecc03174";
    sha256 = "0qii3vjmljk6frcz6iigd7q8icwvykp80qdwaim973qhjvkwmrb5";
  };
}

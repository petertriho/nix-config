{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule {
  pname = "jira-beads-sync";
  version = "0.0.5-unstable-2026-02-01";

  src = fetchFromGitHub {
    owner = "conallob";
    repo = "jira-beads-sync";
    rev = "6fe749359824936e51c54099f745bfa21c29111d";
    hash = "sha256-wqAL4tnHcprNdwVPmiVPgazZMc5bnEQn8OcZA610z+I=";
  };

  vendorHash = "sha256-zYJ2SQ46+hr3irDJHbB3QGtqvyYe+JLMiXxjg5w3VQE=";

  ldflags = [
    "-s"
    "-w"
  ];

  meta = with lib; {
    description = "Sync Jira tasks with beads issues";
    homepage = "https://github.com/conallob/jira-beads-sync";
    license = licenses.bsd3;
    mainProgram = "jira-beads-sync";
  };
}

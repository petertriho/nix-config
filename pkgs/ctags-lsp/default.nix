{
  buildGoModule,
  fetchFromGitHub,
  git,
  jujutsu,
  lib,
  makeWrapper,
  nix-update-script,
  universal-ctags,
  versionCheckHook,
}:
buildGoModule rec {
  pname = "ctags-lsp";
  version = "0.10.2-unstable-2026-01-17";
  vendorHash = null;

  src = fetchFromGitHub {
    owner = "netmute";
    repo = "ctags-lsp";
    rev = "cddb8c7465416f278e940549236c9d2a70921178";
    sha256 = "sha256-SK8luMOP1xVa//D8xNrc7hcbXwDx+aNhoKWqK9MH5vQ=";
  };

  nativeBuildInputs = [ makeWrapper ];

  ldflags = [
    "-s"
    "-w"
    "-X main.version=${version}"
  ];

  postInstall = ''
    wrapProgram $out/bin/ctags-lsp \
        --suffix PATH :${
          lib.makeBinPath [
            universal-ctags
            git
            jujutsu
          ]
        }

'';

  # doInstallCheck = true;
  # nativeInstallCheckInputs = [ versionCheckHook ];
  #
  # passthru.updateScript = nix-update-script { };

  meta = {
    # changelog = "https://github.com/netmute/ctags-lsp/releases/tag/v${version}";
    description = "LSP implementation using universal-ctags as backend";
    homepage = "https://github.com/netmute/ctags-lsp";
    license = lib.licenses.mit;
    mainProgram = "ctags-lsp";
    maintainers = with lib.maintainers; [ voronind ];
  };
}

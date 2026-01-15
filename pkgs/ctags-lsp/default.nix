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
  version = "0.10.2-unstable-2026-01-08";
  vendorHash = null;

  src = fetchFromGitHub {
    owner = "netmute";
    repo = "ctags-lsp";
    rev = "34fe1992683eeb3e4ea32d299992d13d8501a46d";
    sha256 = "06gpbfamn5cx16rj3p4qysnylpfswywg69hkk7k5xff8qmajgjgi";
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

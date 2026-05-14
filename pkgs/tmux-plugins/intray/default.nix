{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0-unstable-2026-05-13";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    rev = "01b53219f67bdcdecdf9ac106bc12fe8146826ac";
    hash = "sha256-9QM1zl5ifkTdYrOOSGbZlRfmsj3hSdKzW7sShOLChKQ=";
  };

  cli = buildGoModule {
    pname = "tmux-intray";
    inherit version src;
    vendorHash = "sha256-47T/oay5NoMnBknA5mo8N5J79rTVvKDekGrmXi6vARQ=";
    subPackages = [ "cmd/tmux-intray" ];
    doCheck = false;
  };
in
tmuxPlugins.mkTmuxPlugin {
  pluginName = "intray";
  inherit version src;

  rtpFilePath = "tmux-intray.tmux";

  nativeBuildInputs = [ makeWrapper ];

  postInstall = ''
    wrapProgram $target/tmux-intray.tmux \
      --prefix PATH : ${lib.makeBinPath [ cli ]}

    mkdir -p $out/bin
    makeWrapper ${cli}/bin/tmux-intray $out/bin/tmux-intray

    mkdir -p $out/share/intray/opencode/plugins
    cp -r $src/opencode/plugins/* $out/share/intray/opencode/plugins/
  '';

  passthru = {
    inherit cli;
  };
}

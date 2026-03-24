{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0.0.1-a01-unstable-2026-03-24";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    rev = "46b03dc37256ec35fbe13be4104fc680553649d1";
    hash = "sha256-iJ/usVD48Fxwqf3n4HjfKFfYV9u4rTGtQCClm18ZvLQ=";
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

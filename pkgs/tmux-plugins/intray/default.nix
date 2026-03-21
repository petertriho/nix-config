{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0-unstable-2026-03-21";
  rev = "1895248313b5554e371c538b2e73b3f4976f6db7";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    inherit rev;
    hash = "sha256-EY3KNQX6uALNKZEOdNYPwmo87aqgnmO+mp6nDLpyZP0=";
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

    mkdir -p $out/share/intray
    cp -r $src/opencode/plugins/* $out/share/intray/
  '';

  passthru = {
    inherit cli;
  };
}

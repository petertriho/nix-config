{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0-unstable-2026-05-06";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    rev = "7b837aacb811ea8c80c0f792c1ccd201a1033596";
    hash = "sha256-kayVCOwKlkanMjzQ4jyuZUbtSSU72AP6erNdN0hUki0=";
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

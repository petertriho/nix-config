{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0.0.1-a01-unstable-2026-04-15";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    rev = "8c9c5d21bf64cc7fa3eb302d488e7738c8b507d8";
    hash = "sha256-CJWKCeSK/uVHAkxm7KO7M923tTVKRVCG59Uf4ELl/z0=";
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

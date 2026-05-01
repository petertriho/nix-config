{
  lib,
  tmuxPlugins,
  fetchFromGitHub,
  buildGoModule,
  makeWrapper,
}:
let
  version = "0.0.1-a01-unstable-2026-04-30";

  src = fetchFromGitHub {
    owner = "cristianoliveira";
    repo = "tmux-intray";
    rev = "c082635e07dafd8eada60347bfb72796afa2ffe6";
    hash = "sha256-hRT7OedzbPLaey/iNvk5hW0rxX6h0QwHr9ae6X0jIbg=";
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

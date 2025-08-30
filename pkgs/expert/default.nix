{
  stdenv,
  lib,
  fetchgit,
  elixir,
  erlang,
  git,
  just,
  zig,
  git-lfs,
  cacert,
  ...
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "expert";
  version = "unstable-2024-08-30";

  src = fetchgit {
    url = "https://github.com/elixir-lang/expert.git";
    rev = "0767fb48357a1cb7a0e14ffade6ed9f5e0ae4fc3";
    hash = "sha256-8yJozbwESlNXJy6oIl4nTV6SC7NJSWOsGdq1Zii01f0=";
    fetchLFS = true;
  };

  nativeBuildInputs = [
    elixir
    erlang
    git
    just
    zig
    git-lfs
    cacert
  ];

  configurePhase = ''
    export HOME=$TMPDIR
    export MIX_ENV=prod
    export SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt
    export GIT_SSL_CAINFO=${cacert}/etc/ssl/certs/ca-bundle.crt
    git config --global http.sslCAInfo ${cacert}/etc/ssl/certs/ca-bundle.crt
  '';

  buildPhase = ''
    just deps forge
    just deps engine
    just deps expert
    just release-local
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp apps/expert/burrito_out/expert_* $out/bin/expert
    chmod +x $out/bin/expert
  '';

  meta = with lib; {
    description = "Expert language server for Elixir";
    homepage = "https://github.com/elixir-lang/expert";
    license = licenses.asl20;
    maintainers = [ ];
    platforms = platforms.all;
  };
})

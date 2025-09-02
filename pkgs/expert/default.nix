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
  version = "nightly-unstable-2025-09-01";

  src = fetchgit {
    url = "https://github.com/elixir-lang/expert.git";
    rev = "3f5914a98ff6b6b28508c0329ecf8b92adc0f947";
    hash = "sha256-oFo3OeSzwXrE3Q0Z7YC0KAS67c8WXBy7xXA7psgQS1I=";
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

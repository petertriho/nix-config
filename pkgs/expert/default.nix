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
  version = "nightly-unstable-2025-09-04";

  src = fetchgit {
    url = "https://github.com/elixir-lang/expert.git";
    rev = "db67ba90b31eac0451ba9727ec11266d71dc844c";
    hash = "sha256-QxLNayaMb0kgdUj4Hzz7DRuMk/yYdZoBugM2aLFQCk0=";
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

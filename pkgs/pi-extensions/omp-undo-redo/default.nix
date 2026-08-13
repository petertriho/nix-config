{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "omp-undo-redo";
  version = "1.3.1-unstable-2026-08-13";

  src = fetchFromGitHub {
    owner = "Baylar55";
    repo = "omp-undo-redo";
    rev = "b33dd9c71524b368db8f2d126e1a322c15a6f160";
    hash = "sha256-xRi46EesECTErfFSl0NB7rcH/qHhTjmbmfKug4d9rns=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-1Z+/SW5N8vqekBy4a/RCj0L0yAPPIBshatOZsp5to84=";
  npmDepsFetcherVersion = 2;

  # Transitive dev dep @huggingface/transformers → onnxruntime-node runs a
  # postinstall that downloads a native binary from api.nuget.org. Not needed
  # for `tsc` (type declarations only) or at pi runtime, so skip install-time
  # lifecycle scripts. `npm run build` in buildPhase is unaffected.
  npmFlags = [ "--ignore-scripts" ];

  # `npm run build` (prebuild cleans dist, build runs `tsc -p tsconfig.json`,
  # postbuild enforces src/dist output parity) produces dist/index.js — the
  # entry declared in the package manifest's `pi.extensions`. Peer dep
  # @oh-my-pi/pi-coding-agent is injected by pi at runtime, so dev deps are
  # omitted. No native deps; pure JS.
  #
  # npm installs under the scoped name @baylarsadigov/omp-undo-redo, but pi's
  # piPackageRoot helper resolves the un-scoped lib/node_modules/<pname>. Add a
  # relative symlink so both paths resolve.
  postInstall = ''
    ln -s @baylarsadigov/omp-undo-redo $out/lib/node_modules/omp-undo-redo
  '';

  meta = {
    description = "Undo/redo session and file navigation extension for Pi/OMP";
    homepage = "https://github.com/Baylar55/omp-undo-redo";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}

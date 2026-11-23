{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
}:
buildNpmPackage {
  pname = "omp-undo-redo";
  version = "1.8.1-unstable-2026-11-21";

  src = fetchFromGitHub {
    owner = "Baylar55";
    repo = "omp-undo-redo";
    rev = "78231d9c0efdf81274b1c30acaa0fe6b81d894af";
    hash = "sha256-zQ9YUUqOGeXUY4optNCBqwJkRdOWP263aixgoPI3eN4=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-Ca6bLd1+tb0gtUUXdVraOu+FzfM7eqnoX5hilqcJXJ8=";
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

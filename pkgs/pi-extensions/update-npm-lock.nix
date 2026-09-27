{
  lib,
  writeShellScriptBin,
  coreutils,
  jq,
  nodejs_24,
  prefetch-npm-deps,
}:

{
  pname,
  src,
  postPatch,
  sourceRoot ? src.name,
  npmDepsFetcherVersion ? 2,
}:

let
  sourceDir =
    if sourceRoot == src.name then
      src
    else if lib.hasPrefix "${src.name}/" sourceRoot then
      "${src}/${lib.removePrefix "${src.name}/" sourceRoot}"
    else
      throw "Unsupported sourceRoot for ${pname}: ${sourceRoot}";
in
writeShellScriptBin "update-npm-lock-${pname}" ''
  set -euo pipefail
  export PATH="${lib.makeBinPath [
    coreutils
    jq
    nodejs_24
    prefetch-npm-deps
  ]}:$PATH"

  if [[ $# -eq 0 ]]; then
    repo_root=$PWD
    system=$(nix eval --impure --raw --expr 'builtins.currentSystem')
  elif [[ $# -eq 2 ]]; then
    repo_root=$1
    system=$2
  else
    echo "Usage: update-npm-lock-${pname} [REPO_ROOT SYSTEM]" >&2
    exit 2
  fi
  package_dir="$repo_root/pkgs/pi-extensions/${pname}"
  default_nix="$package_dir/default.nix"
  lockfile="$package_dir/package-lock.json"
  tmp_dir=$(mktemp -d)
  restore=false
  cleanup() {
    if [[ $restore == true ]]; then
      cp "$tmp_dir/original-lock.json" "$lockfile"
      cp "$tmp_dir/original-default.nix" "$default_nix"
    fi
    rm -rf "$tmp_dir"
  }
  trap cleanup EXIT

  cp "${sourceDir}/package.json" "$tmp_dir/package.json"
  # The store copy is read-only. postPatch replaces it with mv.
  chmod u+w "$tmp_dir/package.json"
  (
    cd "$tmp_dir"
    ${postPatch}
    chmod u+w package.json package-lock.json
    npm install --package-lock-only --ignore-scripts --no-audit --no-fund --workspaces=false
  )

  if ! jq -e -s '
    .[0] as $manifest | .[1].packages[""] as $locked
    | ($manifest | {name, version, dependencies, devDependencies, optionalDependencies})
      == ($locked | {name, version, dependencies, devDependencies, optionalDependencies})
  ' "$tmp_dir/package.json" "$tmp_dir/package-lock.json" > /dev/null; then
    echo "Generated ${pname} lockfile does not match the stripped manifest" >&2
    exit 1
  fi
  if ! jq -e 'all(.packages[]; .resolved == null or .integrity != null)' \
    "$tmp_dir/package-lock.json" > /dev/null; then
    echo "Generated ${pname} lockfile has a resolved package without integrity" >&2
    exit 1
  fi

  new_hash=$(NPM_FETCHER_VERSION=${toString npmDepsFetcherVersion} \
    prefetch-npm-deps "$tmp_dir/package-lock.json")
  if [[ ! $new_hash =~ ^sha256-[A-Za-z0-9+/]{43}=$ ]]; then
    echo "Invalid ${pname} npmDepsHash: $new_hash" >&2
    exit 1
  fi
  old_hash=$(sed -nE 's/^[[:space:]]*npmDepsHash = "(sha256-[A-Za-z0-9+/=]+)";$/\1/p' "$default_nix")
  if [[ ! $old_hash =~ ^sha256-[A-Za-z0-9+/]{43}=$ ]]; then
    echo "Cannot locate npmDepsHash in $default_nix" >&2
    exit 1
  fi
  sed "s|npmDepsHash = \"$old_hash\";|npmDepsHash = \"$new_hash\";|" \
    "$default_nix" > "$tmp_dir/default.nix"

  if cmp -s "$tmp_dir/package-lock.json" "$lockfile" &&
    cmp -s "$tmp_dir/default.nix" "$default_nix"; then
    echo "${pname} lockfile and npmDepsHash are current"
    exit 0
  fi

  cp "$lockfile" "$tmp_dir/original-lock.json"
  cp "$default_nix" "$tmp_dir/original-default.nix"
  restore=true
  cp "$tmp_dir/package-lock.json" "$lockfile"
  cp "$tmp_dir/default.nix" "$default_nix"
  if ! nix build --no-link --accept-flake-config \
    "$repo_root#packages.$system.pi-extensions.${pname}"; then
    echo "${pname} build failed; restoring lockfile and npmDepsHash" >&2
    exit 1
  fi
  restore=false
  echo "${pname} lockfile and npmDepsHash updated"
''

{
  inputs,
  config,
  pkgs,
  lib,
  ...
}: let
  valeWithStyles = pkgs.vale.withStyles (s:
    with s; [
      alex
      google
      microsoft
      proselint
      readability
      write-good
    ]);

  removePythonLicense = ''
    rm $out/lib/python*/site-packages/LICENSE
  '';

  autoflake =
    pkgs.python3Packages.autoflake.overridePythonAttrs
    (old: rec {
      postFixup = removePythonLicense;
    });

  docformatter =
    pkgs.python3Packages.docformatter.overridePythonAttrs
    (old: rec {
      postInstall = removePythonLicense;
    });

  fish-lsp = pkgs.mkYarnPackage rec {
    pname = "fish-lsp";
    version = "unstable-2024-07-25";
    src = pkgs.fetchFromGitHub {
      owner = "petertriho";
      repo = "fish-lsp";
      rev = "1028af3a1e4199c66a3dae65859e0f1ae0172a48";
      sha256 = "0gzg7y6rfpbw4l6g6gzh3l62x2n31r34g249rxxjhnw8mq87rm7f";
    };
    offlineCache = pkgs.fetchYarnDeps {
      yarnLock = src + "/yarn.lock";
      hash = "sha256-hHw7DbeqaCapqx4dK5Y3sPut94ist9JOU8g9dd6gBdo=";
    };
    nativeBuildInputs = with pkgs; [
      fish
      fixup-yarn-lock
      installShellFiles
      makeWrapper
      nodejs
      which
      yarn
    ];
    buildPhase = ''
      runHook preBuild

      export fish_wasm_file=$(find node_modules -type f -a -name tree-sitter-fish.wasm | xargs realpath)
      yarn setup

      yarn --offline compile
      yarn run sh:relink

      runHook postBuild
    '';
    postInstall = ''
      makeWrapper ${pkgs.nodejs}/bin/node "$out/bin/fish-lsp" \
        --add-flags "$out/libexec/fish-lsp/deps/fish-lsp/out/cli.js"

      installShellCompletion --cmd fish-lsp \
        --fish <($out/bin/fish-lsp complete --fish)

      wrapProgram "$out/bin/fish-lsp" \
        --set-default fish_lsp_logfile "/tmp/fish_lsp_logs.txt"
    '';
  };

  pyemojify = with pkgs.python3Packages;
    buildPythonPackage rec {
      pname = "pyemojify";
      version = "0.2.0";
      src = pkgs.fetchPypi {
        inherit pname version;
        sha256 = "sha256-a7w8jVLj3z5AObwMrTYW0+tXm0xuFaEb1eDvDVeVlqk=";
      };
      propagatedBuildInputs = [
        click
      ];
      doCheck = false;
    };

  pybetter = with pkgs.python3Packages;
    buildPythonApplication rec {
      pname = "pybetter";
      version = "0.4.1";
      format = "pyproject";
      src = pkgs.fetchPypi {
        inherit pname version;
        sha256 = "sha256-tDHPGBSTVIWrHGnj0k8ezN5KTRDx2ty5yhFEkCtvnHk=";
      };
      postPatch = ''
        substituteInPlace pyproject.toml \
        --replace poetry.masonry.api poetry.core.masonry.api \
        --replace "poetry>=" "poetry-core>="
      '';
      postInstall = removePythonLicense;

      doCheck = false;
      dontCheckRuntimeDeps = true;
      nativeBuildInputs = [
        poetry-core
      ];
      propagatedBuildInputs = [
        click
        libcst
        pyemojify
        pygments
      ];
    };

  sort-package-json = pkgs.buildNpmPackage rec {
    pname = "sort-package-json";
    version = "unstable-2024-06-18";
    src = pkgs.fetchFromGitHub {
      owner = "keithamus";
      repo = "sort-package-json";
      rev = "d4bd8e25bdaf1cfd72649721d3e79e554d13f3a5";
      sha256 = "0jvzidk5mjnd8zdl0awhwl05xz9w70301ywpq1npdmpiysagvvmh";
    };
    npmDepsHash = "sha256-wKs7x1OGX89xT698i3WAz5iNsv71nbmYe8F9DjXO3tI=";
    dontNpmBuild = true;
  };

  ssort = with pkgs.python3Packages;
    buildPythonApplication rec {
      pname = "ssort";
      version = "0.13.0";
      format = "pyproject";
      src = pkgs.fetchPypi {
        inherit pname version;
        sha256 = "sha256-p7NedyX6k7xr2Cg563AIPPMb1YVFNXU0KI2Yikr47E0=";
      };
      doCheck = false;
      nativeBuildInputs = [
        setuptools
      ];
      propagatedBuildInputs = [
        pathspec
      ];
    };
in {
  home.packages = with pkgs; [
    # neovim
    # dependencies
    gcc
    gnumake
    # formatters
    alejandra
    autoflake
    black
    docformatter
    isort
    nodePackages.prettier
    nodePackages.svgo
    pybetter
    python3Packages.reorder-python-imports
    shfmt
    sort-package-json
    ssort
    stylua

    # linters
    bandit
    codespell
    dotenv-linter
    eslint_d
    google-java-format
    hadolint
    markdownlint-cli
    nodePackages.cspell
    refurb
    shellcheck
    selene
    valeWithStyles

    # lsp
    basedpyright
    bash-language-server
    biome
    emmet-language-server
    fish-lsp
    gopls
    htmx-lsp
    jdt-language-server
    ltex-ls
    lua-language-server
    marksman
    nil
    nodePackages.graphql-language-service-cli
    nodePackages.typescript-language-server
    quick-lint-js
    rust-analyzer
    svelte-language-server
    tailwindcss-language-server
    taplo
    terraform-ls
    tflint
    vscode-langservers-extracted # html, css, json, eslint
    yaml-language-server

    # everything everywhere all at once
    html-tidy
    ruff
    stylelint
  ];

  programs.neovim = {
    enable = true;
    package = inputs.neovim-nightly-overlay.packages.${pkgs.system}.default;
    withRuby = false;
    withPython3 = false;
    withNodeJs = false;
  };

  xdg.configFile."nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
  xdg.configFile."code".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/code";
  xdg.configFile."vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  home.file.".vsnip".source = config.lib.meta.mkDotfilesSymlink "neovim/.vsnip";

  home.sessionVariables.EDITOR = "nvim";
}

{
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
      postInstall = removePythonLicense;
    });

  docformatter =
    pkgs.python3Packages.docformatter.overridePythonAttrs
    (old: rec {
      postInstall = removePythonLicense;
    });

  fish-lsp = pkgs.mkYarnPackage rec {
    pname = "fish-lsp";
    version = "1.0.7";
    src = pkgs.fetchFromGitHub {
      owner = "ndonfris";
      repo = pname;
      rev = "v${version}";
      sha256 = "sha256-Np7ELQxHqSnkzVkASYSyO9cTiO1yrakDuK88kkACNAI=";
    };
    offlineCache = pkgs.fetchYarnDeps {
      yarnLock = src + "/yarn.lock";
      hash = "sha256-hmaLWO1Sj+2VujrGD2A+COfVE2D+tCnxyojjq1512K4=";
    };
    nativeBuildInputs = with pkgs; [
      makeWrapper
      fish
      fixup-yarn-lock
      nodejs
      yarn
    ];
    buildPhase = ''
      runHook preBuild

      wasm_file=$(find node_modules -type f -a -name tree-sitter-fish.wasm)
      cp -f $wasm_file ./deps/fish-lsp
      yarn run sh:build-time
      yarn --offline compile
      yarn run sh:relink
      # yarn run sh:build-completions

      runHook postBuild
    '';
    postInstall = ''
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
    version = "2.10.0";
    src = pkgs.fetchFromGitHub {
      owner = "keithamus";
      repo = pname;
      rev = "v${version}";
      hash = "sha256-JiOQI3oUH4TaCWd8rx8796vXNhwior380PlQfjQXMzA=";
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
    neovim
    # dependencies
    fd
    fzf
    gcc
    gnumake
    ripgrep
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
    jq
    ruff
    stylelint
    yq-go
  ];

  xdg.configFile."nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
  xdg.configFile."code".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/code";
  xdg.configFile."vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  home.file.".vsnip".source = config.lib.meta.mkDotfilesSymlink "neovim/.vsnip";
}

{
  inputs,
  config,
  pkgs,
  lib,
  ...
}:
let
  removePythonLicense =
    # sh
    ''
      rm $out/lib/python*/site-packages/LICENSE
    '';

  # angular-language-server =
  #   with pkgs;
  #   stdenv.mkDerivation rec {
  #     pname = "angular-language-server";
  #     version = "18.2.0";
  #
  #     src = fetchFromGitHub {
  #       owner = "angular";
  #       repo = "vscode-ng-language-service";
  #       rev = "v${version}";
  #       hash = "sha256-9+WWKvy/Vu4k0BzJwPEme+9+eDPI1QP0+Ds1CbErCN8=";
  #     };
  #
  #     offlineCache = fetchYarnDeps {
  #       yarnLock = src + "/yarn.lock";
  #       hash = "sha256-N0N0XbNQRN7SHkilzo/xNlmn9U/T/WL5x8ttTqUmXl0=";
  #     };
  #
  #     nativeBuildInputs = [
  #       yarnConfigHook
  #       yarnBuildHook
  #       yarnInstallHook
  #     ];
  #
  #     buildInputs = [
  #       nodejs
  #     ];
  #
  #     postPatch = ''
  #       substituteInPlace package.json \
  #       --replace "yarn bazel build :npm" "yarn --offline bazel build :npm"
  #     '';
  #
  #     yarnBuildScript = "compile";
  #
  #     installPhase =
  #       # sh
  #       ''
  #         runHook preInstall
  #
  #         mkdir -p $out/$pname
  #
  #         cp -r . $out/$pname
  #
  #         ls -la $out/$pname/server
  #         exit 1
  #
  #         makeWrapper ${lib.getExe nodejs} "$out/bin/ngserver" \
  #           --add-flags "$out/$pname/server/index.js"
  #
  #         runHook postInstall
  #       '';
  #   };

  autoflake = pkgs.python3Packages.autoflake.overridePythonAttrs { postFixup = removePythonLicense; };

  docformatter = pkgs.python3Packages.docformatter.overridePythonAttrs {
    postFixup = removePythonLicense;
  };

  fish-lsp =
    with pkgs;
    stdenv.mkDerivation rec {
      pname = "fish-lsp";
      version = "unstable-2024-07-26";

      src = fetchFromGitHub {
        owner = "ndonfris";
        repo = "fish-lsp";
        rev = "v1.0.8-1";
        hash = "sha256-u125EZXQEouVbmJuoW3KNDNqLB5cS/TzblXraClcw6Q=";
      };

      yarnOfflineCache = fetchYarnDeps {
        yarnLock = src + "/yarn.lock";
        hash = "sha256-hHw7DbeqaCapqx4dK5Y3sPut94ist9JOU8g9dd6gBdo=";
      };

      nativeBuildInputs = [
        yarnBuildHook
        yarnConfigHook
        npmHooks.npmInstallHook
        nodejs
        installShellFiles
        makeWrapper
        # fish-lsp dependencies
        fish
        which
      ];

      yarnBuildScript = "setup";

      postBuild =
        # sh
        ''
          yarn --offline compile
        '';

      installPhase =
        # sh
        ''
          runHook preInstall

          mkdir -p $out/$pname

          cp -r . $out/$pname

          makeWrapper ${lib.getExe nodejs} "$out/bin/fish-lsp" \
            --add-flags "$out/$pname/out/cli.js"

          installShellCompletion --cmd fish-lsp \
            --fish <($out/bin/fish-lsp complete --fish)

          runHook postInstall
        '';
    };

  pyemojify =
    with pkgs.python3Packages;
    buildPythonPackage rec {
      pname = "pyemojify";
      version = "0.2.0";
      src = pkgs.fetchPypi {
        inherit pname version;
        sha256 = "sha256-a7w8jVLj3z5AObwMrTYW0+tXm0xuFaEb1eDvDVeVlqk=";
      };
      propagatedBuildInputs = [ click ];
      doCheck = false;
    };

  pybetter =
    with pkgs.python3Packages;
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
      postFixup = removePythonLicense;

      doCheck = false;
      dontCheckRuntimeDeps = true;
      nativeBuildInputs = [ poetry-core ];
      propagatedBuildInputs = [
        click
        libcst
        pyemojify
        pygments
      ];
    };

  sort-package-json = pkgs.buildNpmPackage {
    pname = "sort-package-json";
    version = "unstable-2024-10-08";
    src = pkgs.fetchFromGitHub {
      owner = "keithamus";
      repo = "sort-package-json";
      rev = "ae5ba5f6ec3de7bf3869800cf95b021994708936";
      sha256 = "0jybpka8d5az6v0k5az1nx4nb4ncmlk01cxp84fhy5vkmz1np7dw";
    };
    npmDepsHash = "sha256-SLRsgtAyPPHwrzAUZ9LQi+cV2Gyu0+XmZAhdq8/F3s8=";
    dontNpmBuild = true;
  };

  ssort =
    with pkgs.python3Packages;
    buildPythonApplication rec {
      pname = "ssort";
      version = "0.13.0";
      format = "pyproject";
      src = pkgs.fetchPypi {
        inherit pname version;
        sha256 = "sha256-p7NedyX6k7xr2Cg563AIPPMb1YVFNXU0KI2Yikr47E0=";
      };
      doCheck = false;
      nativeBuildInputs = [ setuptools ];
      propagatedBuildInputs = [ pathspec ];
    };

  vale-with-styles = pkgs.vale.withStyles (
    s: with s; [
      alex
      google
      microsoft
      proselint
      readability
      write-good
    ]
  );
in
{
  home.packages = with pkgs; [
    # neovim
    # dependencies
    gcc
    gnumake
    # nvim-markdown-preview
    pandoc
    nodePackages.live-server

    # formatters
    alejandra
    autoflake
    black
    docformatter
    eslint_d
    isort
    nixfmt-rfc-style
    nodePackages.prettier
    nodePackages.svgo
    prettierd
    pybetter
    python3Packages.reorder-python-imports
    shfmt
    sort-package-json
    ssort
    stylua
    yamlfix
    yamlfmt

    # linters
    bandit
    codespell
    dotenv-linter
    google-java-format
    hadolint
    luajitPackages.luacheck
    markdownlint-cli
    refurb
    shellcheck
    selene
    statix
    vale-with-styles
    yamllint

    # lsp
    # angular-language-server
    basedpyright
    bash-language-server
    biome
    emmet-language-server
    fish-lsp
    gopls
    htmx-lsp
    jdt-language-server
    lua-language-server
    marksman
    nil
    nodePackages.graphql-language-service-cli
    nodePackages.typescript-language-server
    quick-lint-js
    rust-analyzer
    superhtml
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
    defaultEditor = true;
    withRuby = false;
    withPython3 = false;
    withNodeJs = false;
  };

  xdg.configFile = {
    "nvim".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/nvim";
    "vale".source = config.lib.meta.mkDotfilesSymlink "neovim/.config/vale";
  };
}

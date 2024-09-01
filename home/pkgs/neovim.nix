{
  inputs,
  config,
  pkgs,
  lib,
  ...
}:
let
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

  removePythonLicense =
    # sh
    ''
      rm $out/lib/python*/site-packages/LICENSE
    '';

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

          cp -r . $out

          makeWrapper ${lib.getExe nodejs} "$out/bin/fish-lsp" \
            --add-flags "$out/out/cli.js"

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
    version = "unstable-2024-08-22";
    src = pkgs.fetchFromGitHub {
      owner = "keithamus";
      repo = "sort-package-json";
      rev = "92de3ef894435e402d76ae1e8444c4683a46ea2c";
      sha256 = "0bg19synkc6szlr4lkhg9v8zz41zp7ji56fscfbfma0kc61qpdvb";
    };
    npmDepsHash = "sha256-wKs7x1OGX89xT698i3WAz5iNsv71nbmYe8F9DjXO3tI=";
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
in
{
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

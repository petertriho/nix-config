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

  superhtml-deps =
    {
      linkFarm,
      fetchzip,
      fetchgit,
    }:
    linkFarm "zig-packages" [
      {
        name = "1220b9ce6dc0e1fbcd9e7b406ab164344f81774351495f860a90729187c3c058ef4f";
        path = fetchgit {
          url = "https://github.com/kristoff-it/zig-lsp-kit";
          rev = "b4bf61d7fbf9cf7cfdb6f01b211947d2de3e42fd";
          hash = "sha256-6mlnPTLBXZQwWXstV+h1PAKtMq8RGcJM2dRJ8NqqqtU=";
        };
      }
      {
        name = "1220102cb2c669d82184fb1dc5380193d37d68b54e8d75b76b2d155b9af7d7e2e76d";
        path = fetchzip {
          url = "https://github.com/ziglibs/diffz/archive/ef45c00d655e5e40faf35afbbde81a1fa5ed7ffb.tar.gz";
          hash = "sha256-5/3W0Xt9RjsvCb8Q4cdaM8dkJP7CdFro14JJLCuqASo=";
        };
      }
      {
        name = "12209cde192558f8b3dc098ac2330fc2a14fdd211c5433afd33085af75caa9183147";
        path = fetchgit {
          url = "https://github.com/ziglibs/known-folders.git";
          rev = "0ad514dcfb7525e32ae349b9acc0a53976f3a9fa";
          hash = "sha256-X+XkFj56MkYxxN9LUisjnkfCxUfnbkzBWHy9pwg5M+g=";
        };
      }
      {
        name = "122014e78d7c69d93595993b3231f3141368e22634b332b0b91a2fb73a8570f147a5";
        path = fetchgit {
          url = "https://github.com/kristoff-it/scripty";
          rev = "df8c11380f9e9bec34809f2242fb116d27cf39d6";
          hash = "sha256-qVm8pIfT1mHL1zanqYdFm/6AVH8poXKqLtz4+2j+F/A=";
        };
      }
      {
        name = "1220f2d8402bb7bbc4786b9c0aad73910929ea209cbd3b063842371d68abfed33c1e";
        path = fetchgit {
          url = "https://github.com/kristoff-it/zig-afl-kit";
          rev = "f003bfe714f2964c90939fdc940d5993190a66ec";
          hash = "sha256-tJ6Ln1SY4WjFZXUWQmgggsUfkd59QgmIpgdInMuv4PI=";
        };
      }
      {
        name = "1220010a1edd8631b2644476517024992f8e57f453bdb68668720bb590d168faf7c8";
        path = fetchgit {
          url = "https://github.com/allyourcodebase/AFLplusplus";
          rev = "032984eabf5a35af386a3d0e542df7686da339c1";
          hash = "sha256-KB3QnKAQQ+5CKvJVrhMveMGpF3NTrlwpIyLHVIB96hs=";
        };
      }
      {
        name = "12200966011c3dd6979d6aa88fe23061fdc6da1f584a6fb1f7682053a0b01e409dbc";
        path = fetchzip {
          url = "https://github.com/AFLplusplus/AFLplusplus/archive/v4.21c.tar.gz";
          hash = "sha256-DKwPRxSO+JEJYWLldnfrAYqzwqukNzrbo4R5FzJqzzg=";
        };
      }
    ];

  superhtml =
    with pkgs;
    stdenv.mkDerivation {
      pname = "superhtml";
      version = "unstable-2024-09-17";

      src = fetchFromGitHub {
        owner = "kristoff-it";
        repo = "superhtml";
        rev = "e6a82d1f3bf0124c4d7d223e902ee2b3096108bf";
        hash = "sha256-LZcayRsW3pboIhhoCsWm65v2i5CavCH40aAxzdyB3A4=";
      };

      nativeBuildInputs = [
        zig.hook
      ];

      postPatch = ''
        ln -s ${callPackage superhtml-deps { }} $ZIG_GLOBAL_CACHE_DIR/p
      '';
    };
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

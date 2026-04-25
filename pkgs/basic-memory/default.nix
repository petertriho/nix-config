{
  lib,
  fetchFromGitHub,
  fetchPypi,
  python3Packages,
}:
with python3Packages;
let
  replacePythonDeps =
    replacements: deps:
    let
      replacementNames = builtins.attrNames replacements;
      shouldKeep =
        pkg:
        let
          name = if pkg ? pname then pkg.pname else "";
        in
        !(builtins.elem name replacementNames);
      remainingDeps = builtins.filter shouldKeep deps;
    in
    (builtins.attrValues replacements) ++ remainingDeps;

  py-key-value-aio = python3Packages."py-key-value-aio".overridePythonAttrs (_: rec {
    version = "0.4.4";
    sourceRoot = "py_key_value_aio-${version}";
    doCheck = false;
    dependencies = [
      aiofile
      anyio
      beartype
      cachetools
      keyring
      typing-extensions
    ];
    propagatedBuildInputs = dependencies;
    src = fetchPypi {
      pname = "py_key_value_aio";
      inherit version;
      hash = "sha256-4wEuYkPtfMCbsFRXvU0DsbpcKxyocACWs5J9t5/7vlU=";
    };
  });

  pydocket = python3Packages.pydocket.overridePythonAttrs (old: {
    dependencies = replacePythonDeps {
      "py-key-value-aio" = py-key-value-aio;
    } (old.dependencies or [ ]);

    propagatedBuildInputs = replacePythonDeps {
      "py-key-value-aio" = py-key-value-aio;
    } (old.propagatedBuildInputs or [ ]);
  });

  fastmcp = python3Packages.fastmcp.overridePythonAttrs (old: rec {
    version = "3.0.1";
    doCheck = false;
    dontUsePythonCatchConflicts = true;
    src = fetchPypi {
      pname = "fastmcp";
      inherit version;
      hash = "sha256-ukY65R41f7orr+UTzJfwoGyfMSIOZYSZC32Ly/afBRY=";
    };

    dependencies = replacePythonDeps {
      "py-key-value-aio" = py-key-value-aio;
      inherit pydocket;
      inherit watchfiles;
    } (old.dependencies or [ ]);

    propagatedBuildInputs = replacePythonDeps {
      "py-key-value-aio" = py-key-value-aio;
      inherit pydocket;
      inherit watchfiles;
    } (old.propagatedBuildInputs or [ ]);
  });
in
buildPythonApplication rec {
  pname = "basic-memory";
  version = "0.20.3";
  format = "pyproject";
  dontUsePythonCatchConflicts = true;

  src = fetchFromGitHub {
    owner = "basicmachines-co";
    repo = "basic-memory";
    rev = "v${version}";
    hash = "sha256-Z3i67L1brHtiCxpuET9KP6690TUkx2QqLn2zv4+EGWg=";
  };

  nativeBuildInputs = [
    hatchling
    uv-dynamic-versioning
  ];

  propagatedBuildInputs = [
    aiofiles
    aiosqlite
    alembic
    anyio
    asyncpg
    dateparser
    fastapi
    fastembed
    fastmcp
    greenlet
    httpx
    loguru
    markdown-it-py
    mcp
    mdformat
    mdformat-frontmatter
    mdformat-gfm
    nest-asyncio
    openai
    pillow
    pybars3
    pydantic
    pydantic-settings
    pyjwt
    pyyaml
    python-dotenv
    python-frontmatter
    psycopg
    rich
    sniffio
    sqlalchemy
    sqlite-vec
    typer
    unidecode
    watchfiles
  ];

  doCheck = false;
  dontCheckRuntimeDeps = true;

  meta = with lib; {
    description = "Local-first knowledge management combining Zettelkasten with knowledge graphs";
    homepage = "https://github.com/basicmachines-co/basic-memory";
    license = licenses.agpl3Plus;
    mainProgram = "basic-memory";
    maintainers = [ ];
  };
}

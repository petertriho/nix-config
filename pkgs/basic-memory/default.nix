{
  lib,
  fetchFromGitHub,
  fetchPypi,
  python3Packages,
}:
with python3Packages;
let
  py-key-value-aio = python3Packages."py-key-value-aio".overridePythonAttrs (_: rec {
    version = "0.4.4";
    sourceRoot = "py_key_value_aio-${version}";
    doCheck = false;
    propagatedBuildInputs = [
      aiofile
      anyio
      cachetools
      keyring
    ];
    src = fetchPypi {
      pname = "py_key_value_aio";
      inherit version;
      hash = "sha256-4wEuYkPtfMCbsFRXvU0DsbpcKxyocACWs5J9t5/7vlU=";
    };
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

    propagatedBuildInputs = [
      py-key-value-aio
      watchfiles
    ]
    ++ lib.filter (pkg: ((pkg.pname or null) != "py-key-value-aio")) (old.propagatedBuildInputs or [ ]);
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

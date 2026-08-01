{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs_24,
  autoPatchelfHook,
  zlib,
}:
buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "2.17.0";

  src = fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "82c631dca1b9217701af0ccfe763ef3b79cd1ec0";
    hash = "sha256-jP3bHSQO6toATLLE9pgoHMGUxZsoDDdEJARc5Ut0g8w=";
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-hwNO3Q92JwaJ0CJzBfbiEPwVJUbbOlGzFOpzoRQITN8=";
  npmDepsFetcherVersion = 2;

  dontNpmBuild = true;
  npmInstallFlags = [ "--omit=dev" ];

  postPatch = ''
    substituteInPlace package-lock.json \
      --replace-fail \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.79.10.tgz",' \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.79.10.tgz", "integrity": "sha512-XKxgdjhcPuyjrthCOFSgfzT3xZ1uBrJ1IMVDxci1to6hIN6BIg9J5iY8q0pGXK1DLgATLP23da+1UyZLwA360Q==",' \
      --replace-fail \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.79.10.tgz",' \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.79.10.tgz", "integrity": "sha512-9jR23tOl0BIUdQMn70Gr72xYBpM7Xgl9Lyv7gAnU1USfkNRuYG/f/edLl+n/Dp/RafDW3JI4DF7y/GhgkORuew==",' \
      --replace-fail \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.79.10.tgz",' \
        '      "resolved": "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.79.10.tgz", "integrity": "sha512-FUVOjDn1DVwM1uHD5MNYboXQrXjIDbSt+BQ3py7nQWCY62tKfxgiM1OBMxTcwRWLfSdZHUPpV0hm1loIdUJnPw==",'
  '';

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    stdenv.cc.cc.lib
    zlib
  ];

  meta = {
    description = "MCP adapter extension for the Pi coding agent";
    homepage = "https://github.com/nicobailon/pi-mcp-adapter";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "pi-mcp-adapter";
  };
}

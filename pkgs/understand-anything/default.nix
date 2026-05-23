{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs_24,
  node-gyp,
  python3,
  coreutils,
  darwin,
}:
let
  pnpm = pnpm_10.override { nodejs = nodejs_24; };
in
stdenv.mkDerivation (finalAttrs: {
  pname = "understand-anything";
  version = "2.7.4-unstable-2026-05-22";

  src = fetchFromGitHub {
    owner = "Lum1104";
    repo = "Understand-Anything";
    rev = "f51727526d654541ca64161c2ac510afa58e1ac5";
    hash = "sha256-yHUoWohos3eLBqJLf8Bs31tOk1GShvMxGIAeDZjFDYM=";
  };

  patches = [ ./store-safe-runtime.patch ];

  nativeBuildInputs = [
    nodejs_24
    node-gyp
    pnpmConfigHook
    pnpm
    python3
  ]
  ++ lib.optionals stdenv.hostPlatform.isDarwin [ darwin.cctools ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-7jjQzD4arlqmzU4ubhsf0Wr/9W3a/1BBhOJ/Q7Gf6bo=";
  };

  preConfigure = ''
    export npm_config_nodedir=${nodejs_24}
  '';

  buildPhase = ''
    runHook preBuild

    pnpm --filter @understand-anything/core build
    pnpm --filter @understand-anything/skill build
    pnpm --filter @understand-anything/dashboard build

    runHook postBuild
  '';

  installPhase = ''
        runHook preInstall

        workspace="$out/share/understand-anything"
        pluginRoot="$workspace/understand-anything-plugin"
        install -d "$workspace" "$out/bin"

        cp -r node_modules package.json pnpm-lock.yaml .npmrc understand-anything-plugin "$workspace/"
        rm -f "$workspace/node_modules/.pnpm/node_modules/homepage" "$workspace/node_modules/homepage"
        cat > "$workspace/pnpm-workspace.yaml" <<'EOF'
    packages:
      - "understand-anything-plugin"
      - "understand-anything-plugin/packages/*"
    EOF

        cat > "$workspace/dashboard-server.cjs" <<'EOF'
    #!/usr/bin/env node
    const http = require("node:http");
    const fs = require("node:fs");
    const path = require("node:path");
    const crypto = require("node:crypto");

    const projectRoot = process.argv[2];
    const distRoot = process.argv[3];
    const token = process.env.UNDERSTAND_ACCESS_TOKEN || crypto.randomBytes(16).toString("hex");
    const requestedPort = Number(process.env.UNDERSTAND_DASHBOARD_PORT || process.env.PORT || 5173);
    const maxSourceFileBytes = 1024 * 1024;

    if (!projectRoot || !distRoot) {
      console.error("Usage: dashboard-server.cjs <project-root> <dashboard-dist>");
      process.exit(64);
    }

    if (!fs.existsSync(path.join(projectRoot, ".understand-anything", "knowledge-graph.json"))) {
      console.error("No knowledge graph found. Run /understand first to analyze this project.");
      process.exit(66);
    }

    if (!fs.existsSync(path.join(distRoot, "index.html"))) {
      console.error("Dashboard assets are missing: " + distRoot);
      process.exit(66);
    }

    const mimeTypes = {
      ".css": "text/css; charset=utf-8",
      ".gif": "image/gif",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".txt": "text/plain; charset=utf-8",
      ".webp": "image/webp",
    };

    function send(res, statusCode, body, contentType) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", contentType || "application/json");
      res.end(body);
    }

    function sendJson(res, statusCode, payload) {
      send(res, statusCode, JSON.stringify(payload), "application/json");
    }

    function graphFilePath(fileName) {
      return path.join(projectRoot, ".understand-anything", fileName);
    }

    function graphFileCandidates(fileName) {
      return [graphFilePath(fileName)];
    }

    function projectRootFromGraphFile(candidate) {
      return path.dirname(path.dirname(candidate));
    }

    function normalizeGraphPath(filePath, root) {
      const rawPath = path.isAbsolute(filePath)
        ? filePath.startsWith(root)
          ? path.relative(root, filePath)
          : null
        : filePath;
      if (rawPath === null) return null;
      const normalized = path.normalize(rawPath);
      if (
        !normalized ||
        normalized === "." ||
        normalized.includes("\0") ||
        normalized === ".." ||
        normalized.startsWith(".." + path.sep) ||
        path.isAbsolute(normalized)
      ) {
        return null;
      }
      return normalized.split(path.sep).join("/");
    }

    function graphFilePathSet(graphFile, root) {
      const allowed = new Set();
      try {
        const raw = JSON.parse(fs.readFileSync(graphFile, "utf-8"));
        for (const node of raw.nodes || []) {
          if (typeof node.filePath !== "string") continue;
          const normalized = normalizeGraphPath(node.filePath, root);
          if (normalized) allowed.add(normalized);
        }
      } catch {
        return allowed;
      }
      return allowed;
    }

    function detectLanguage(filePath) {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const byExt = {
        bash: "bash",
        c: "c",
        cc: "cpp",
        cpp: "cpp",
        cs: "csharp",
        css: "css",
        go: "go",
        h: "c",
        hpp: "cpp",
        html: "markup",
        java: "java",
        js: "javascript",
        jsx: "jsx",
        json: "json",
        md: "markdown",
        mjs: "javascript",
        nix: "nix",
        py: "python",
        rb: "ruby",
        rs: "rust",
        sh: "bash",
        ts: "typescript",
        tsx: "tsx",
        txt: "text",
        yaml: "yaml",
        yml: "yaml",
      };
      return byExt[ext] || "text";
    }

    function rejectFileRequest(message, statusCode) {
      return { statusCode: statusCode || 400, payload: { error: message } };
    }

    function readSourceFile(url) {
      const requestedPath = url.searchParams.get("path") || "";
      if (!requestedPath) return rejectFileRequest("Missing path");
      if (requestedPath.includes("\0")) return rejectFileRequest("Invalid path");
      if (path.isAbsolute(requestedPath)) return rejectFileRequest("Absolute paths are not allowed");

      const normalizedPath = path.normalize(requestedPath);
      if (
        normalizedPath === "." ||
        normalizedPath.startsWith(".." + path.sep) ||
        normalizedPath === ".." ||
        path.isAbsolute(normalizedPath)
      ) {
        return rejectFileRequest("Path must stay inside the project");
      }

      const graphFile = graphFilePath("knowledge-graph.json");
      const safeRelativePath = path.resolve(projectRoot, normalizedPath);
      const relativeToRoot = path.relative(projectRoot, safeRelativePath);
      if (
        !relativeToRoot ||
        relativeToRoot.startsWith(".." + path.sep) ||
        relativeToRoot === ".." ||
        path.isAbsolute(relativeToRoot)
      ) {
        return rejectFileRequest("Path must stay inside the project");
      }

      const safeGraphPath = relativeToRoot.split(path.sep).join("/");
      if (!graphFilePathSet(graphFile, projectRoot).has(safeGraphPath)) {
        return rejectFileRequest("File is not in the knowledge graph", 404);
      }

      let stat;
      try {
        stat = fs.statSync(safeRelativePath);
      } catch {
        return rejectFileRequest("File not found", 404);
      }

      if (!stat.isFile()) return rejectFileRequest("Path is not a file");
      if (stat.size > maxSourceFileBytes) return rejectFileRequest("File is too large to preview", 413);

      const buffer = fs.readFileSync(safeRelativePath);
      if (buffer.includes(0)) return rejectFileRequest("Binary files cannot be previewed", 415);

      const content = buffer.toString("utf8");
      return {
        statusCode: 200,
        payload: {
          path: safeGraphPath,
          language: detectLanguage(relativeToRoot),
          content,
          sizeBytes: buffer.byteLength,
          lineCount: content.length === 0 ? 0 : content.split(/\r\n|\n|\r/).length,
        },
      };
    }

    function serveGraphJson(res, fileName) {
      const candidates = graphFileCandidates(fileName);
      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(candidate, "utf-8"));
          const root = projectRootFromGraphFile(candidate);
          if (Array.isArray(raw.nodes)) {
            raw.nodes = raw.nodes.map((node) => {
              if (typeof node.filePath !== "string") return node;
              const filePath = node.filePath;
              const relativePath = filePath.startsWith(root)
                ? filePath.slice(root.length).replace(/^[\\/]/, "")
                : path.isAbsolute(filePath)
                  ? path.basename(filePath)
                  : filePath;
              return { ...node, filePath: relativePath };
            });
          }
          sendJson(res, 200, raw);
        } catch (err) {
          console.error("[understand-anything] Failed to read graph file:", err);
          sendJson(res, 500, { error: "Failed to read graph file" });
        }
        return;
      }
      sendJson(res, 404, { error: "Not found" });
    }

    function serveConfig(res) {
      const configPath = graphFilePath("config.json");
      if (fs.existsSync(configPath)) {
        try {
          sendJson(res, 200, JSON.parse(fs.readFileSync(configPath, "utf-8")));
        } catch {
          sendJson(res, 500, { error: "Failed to read config file" });
        }
        return;
      }
      sendJson(res, 200, { autoUpdate: false, outputLanguage: "en" });
    }

    function serveStatic(reqPath, res) {
      let decoded;
      try {
        decoded = decodeURIComponent(reqPath);
      } catch {
        sendJson(res, 400, { error: "Invalid path" });
        return;
      }
      const relative = decoded.replace(/^\/+/, "") || "index.html";
      const requested = path.resolve(distRoot, relative);
      const resolvedDist = path.resolve(distRoot);
      const indexFile = path.join(resolvedDist, "index.html");
      const selected = requested.startsWith(resolvedDist + path.sep) && fs.existsSync(requested) && fs.statSync(requested).isFile()
        ? requested
        : indexFile;
      send(res, 200, fs.readFileSync(selected), mimeTypes[path.extname(selected)] || "application/octet-stream");
    }

    const protectedEndpoints = new Set([
      "/knowledge-graph.json",
      "/domain-graph.json",
      "/diff-overlay.json",
      "/meta.json",
      "/config.json",
      "/file-content.json",
    ]);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1:5173");
      if (!protectedEndpoints.has(url.pathname)) {
        serveStatic(url.pathname, res);
        return;
      }

      if (url.searchParams.get("token") !== token) {
        sendJson(res, 403, { error: "Forbidden: missing or invalid token" });
        return;
      }

      if (url.pathname === "/file-content.json") {
        const result = readSourceFile(url);
        sendJson(res, result.statusCode, result.payload);
        return;
      }
      if (url.pathname === "/config.json") {
        serveConfig(res);
        return;
      }
      if (url.pathname === "/meta.json") {
        const metaPath = graphFilePath("meta.json");
        if (fs.existsSync(metaPath)) send(res, 200, fs.readFileSync(metaPath), "application/json");
        else sendJson(res, 404, { error: "Not found" });
        return;
      }
      serveGraphJson(res, url.pathname.slice(1));
    });

    function listen(port) {
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const actualPort = typeof address === "object" && address ? address.port : port;
        console.log("");
        console.log("  Dashboard URL: http://127.0.0.1:" + actualPort + "/?token=" + token);
        console.log("");
      });
    }

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && requestedPort !== 0) {
        listen(0);
        return;
      }
      throw err;
    });

    listen(requestedPort);
    EOF

        # Serve the prebuilt dashboard directly. Running Vite from the immutable Nix
        # store tries to write temporary config files beside node_modules.
        cat > "$out/bin/understand-anything-dashboard" <<EOF
    #!${stdenv.shell}
    set -eu

    if [ "\$#" -gt 1 ]; then
      echo "Usage: understand-anything-dashboard [project-dir]" >&2
      exit 64
    fi

    project_dir="\''${1:-\$PWD}"
    if [ ! -d "\$project_dir" ]; then
      echo "Project directory not found: \$project_dir" >&2
      exit 66
    fi

    project_dir="\$(${coreutils}/bin/realpath "\$project_dir")"
    export GRAPH_DIR="\$project_dir"
    export UNDERSTAND_ANYTHING_PLUGIN_ROOT="$pluginRoot"
    export CLAUDE_PLUGIN_ROOT="\''${CLAUDE_PLUGIN_ROOT:-$pluginRoot}"

    exec ${nodejs_24}/bin/node "$workspace/dashboard-server.cjs" "\$project_dir" "$pluginRoot/packages/dashboard/dist"
    EOF
        chmod +x "$out/bin/understand-anything-dashboard"

        runHook postInstall
  '';

  meta = with lib; {
    description = "AI-powered codebase understanding plugin and dashboard";
    homepage = "https://github.com/Lum1104/Understand-Anything";
    license = licenses.mit;
    mainProgram = "understand-anything-dashboard";
    maintainers = [ ];
    platforms = nodejs_24.meta.platforms;
  };
})

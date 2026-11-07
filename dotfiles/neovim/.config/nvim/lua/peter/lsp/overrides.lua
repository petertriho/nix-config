-- Python LSP Capability Management
-- This tracks which capabilities each Python LSP server provides and which one should be active.
--
-- Capability format:
--   [capability_name] = {
--     active = "server_name",     -- Which server should handle this capability
--     basedpyright = true/false,  -- Does basedpyright support this?
--     pyrefly = true/false,       -- Does pyrefly support this?
--     ruff = true/false,          -- Does ruff support this?
--     ty = true/false,            -- Does ty support this?
--   }

-- NOTE: pyrefly only sees edits to another file after that file is saved, so go to definition can
-- land on an old line until then. This is intended upstream: https://github.com/meta/pyrefly/issues/5005
local python_lsp_capabilities = {
    callHierarchyProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = false,
    },
    codeActionProvider = {
        active = "multiple",
        basedpyright = true, -- organizeImports
        pyrefly = true, -- quickfix, refactor.extract
        ruff = true, -- quickfix, fixAll, organizeImports
        ty = true, -- quickfix
    },
    completionProvider = {
        active = "multiple",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    declarationProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    definitionProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    documentHighlightProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    documentSymbolProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    foldingRangeProvider = {
        active = "pyrefly",
        basedpyright = false,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    hoverProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = true, -- rule documentation
        ty = true,
    },
    implementationProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = false,
    },
    inlayHintProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    referencesProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    renameProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    semanticTokensProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    signatureHelpProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    typeDefinitionProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    workspaceSymbolProvider = {
        active = "pyrefly",
        basedpyright = true,
        pyrefly = true,
        ruff = false,
        ty = true,
    },
    documentFormattingProvider = {
        active = "pyrefly",
        basedpyright = false,
        pyrefly = false,
        ruff = false,
        ty = false,
    },
    documentRangeFormattingProvider = {
        active = "pyrefly",
        basedpyright = false,
        pyrefly = false,
        ruff = false,
        ty = false,
    },
}

-- Track which servers have been validated (once per Neovim session)
local validated_servers = {}

-- Helper function to validate server capabilities against our configuration
local function validate_server_capabilities(client)
    -- Only validate once per server per Neovim session
    if validated_servers[client.name] then
        return
    end
    validated_servers[client.name] = true

    local mismatches = {
        unexpected = {}, -- Server has capability but we marked it as false
        missing = {}, -- Server lacks capability but we marked it as true
    }

    for capability, config in pairs(python_lsp_capabilities) do
        local expected = config[client.name]
        local actual = client.server_capabilities[capability]

        -- Check for mismatches
        if expected == true and not actual then
            table.insert(mismatches.missing, capability)
        elseif expected == false and actual then
            table.insert(mismatches.unexpected, capability)
        end
    end

    -- Report mismatches
    if #mismatches.unexpected > 0 then
        vim.notify(
            string.format(
                "⚠️  %s: NEW capabilities detected (update config):\n  %s",
                client.name,
                table.concat(mismatches.unexpected, "\n  ")
            ),
            vim.log.levels.WARN
        )
    end

    if #mismatches.missing > 0 then
        vim.notify(
            string.format(
                "⚠️  %s: REMOVED capabilities detected (update config):\n  %s",
                client.name,
                table.concat(mismatches.missing, "\n  ")
            ),
            vim.log.levels.WARN
        )
    end

    return mismatches
end

-- Helper function to disable capabilities for a server based on the active configuration
local function disable_capabilities_for_server(client)
    -- First validate the capabilities (only runs once per server per session)
    validate_server_capabilities(client)

    local disabled = {}
    for capability, config in pairs(python_lsp_capabilities) do
        -- If this server supports the capability but it's not the active one, disable it
        if config[client.name] and config.active ~= client.name and config.active ~= "multiple" then
            client.server_capabilities[capability] = false
            table.insert(disabled, capability)
        end
    end
    return disabled
end

-- Check if basedpyright can be deprecated
local function check_basedpyright_deprecation()
    local basedpyright_still_needed = {}
    for capability, config in pairs(python_lsp_capabilities) do
        if config.active == "basedpyright" then
            table.insert(basedpyright_still_needed, capability)
        end
    end

    if #basedpyright_still_needed == 0 then
        vim.notify("🎉 basedpyright can now be deprecated! All capabilities have been migrated.", vim.log.levels.INFO)
        return true
    else
        vim.notify(
            string.format("basedpyright still needed for: %s", table.concat(basedpyright_still_needed, ", ")),
            vim.log.levels.DEBUG
        )
        return false
    end
end

-- pyrefly registers each batch of file watchers under one ID, and Neovim cancels the earlier
-- registration when an ID repeats. That drops the `**/*.py` watcher, so each batch gets its own ID.
local function make_unique_file_watcher_handlers()
    local watched_files_method = "workspace/didChangeWatchedFiles"
    local issued_ids = {} -- [client_id][server_id] = IDs given to Neovim
    local next_suffix = 0

    return {
        ["client/registerCapability"] = function(err, result, ctx, config)
            issued_ids[ctx.client_id] = issued_ids[ctx.client_id] or {}
            local client_ids = issued_ids[ctx.client_id]

            for _, registration in ipairs(result.registrations) do
                if registration.method == watched_files_method then
                    next_suffix = next_suffix + 1
                    local unique_id = registration.id .. "#" .. next_suffix
                    client_ids[registration.id] = client_ids[registration.id] or {}
                    table.insert(client_ids[registration.id], unique_id)
                    registration.id = unique_id
                end
            end

            return vim.lsp.handlers["client/registerCapability"](err, result, ctx, config)
        end,
        ["client/unregisterCapability"] = function(err, result, ctx, config)
            local client_ids = issued_ids[ctx.client_id] or {}
            local unregistrations = {}

            -- The LSP specification spells this field "unregisterations".
            for _, unregistration in ipairs(result.unregisterations) do
                local unique_ids = client_ids[unregistration.id]
                if unregistration.method == watched_files_method and unique_ids then
                    for _, unique_id in ipairs(unique_ids) do
                        table.insert(unregistrations, { id = unique_id, method = unregistration.method })
                    end
                    client_ids[unregistration.id] = nil
                else
                    table.insert(unregistrations, unregistration)
                end
            end
            result.unregisterations = unregistrations

            return vim.lsp.handlers["client/unregisterCapability"](err, result, ctx, config)
        end,
    }
end

local TAILWIND_STYLESHEET_PATTERN = "@tailwind[[:space:]]"
    .. "|@theme([[:space:]]+[a-z]+)*[[:space:]]*\\{"
    .. "|@config[[:space:]]*['\"]"
    .. "|@import[[:space:]]*(url\\()?['\"][^'\"]*tailwind"

-- nvim-lspconfig falls back to `.git` because Tailwind v4 needs no config file, and that starts the
-- server in every repository. This follows the checks in the Tailwind VS Code extension, but an
-- `@import` must name Tailwind. The extension accepts any `@import`, which also starts it elsewhere.
local function tailwind_root_dir(bufnr, on_dir)
    local util = require("lspconfig.util")
    local fname = vim.api.nvim_buf_get_name(bufnr)
    local markers = {
        "tailwind.config.js",
        "tailwind.config.cjs",
        "tailwind.config.mjs",
        "tailwind.config.ts",
        "tailwind.config.mts",
        "tailwind.config.cts",
    }
    markers = util.insert_package_json(markers, "tailwindcss", fname)
    markers = util.root_markers_with_field(markers, { "mix.lock", "Gemfile.lock" }, "tailwind", fname)

    -- This runs on the main thread for each buffer, so it uses names. A predicate would list every
    -- parent directory, which blocked for 81 ms in a directory with 100,000 files.
    local match = vim.fs.find(markers, { path = vim.fs.dirname(fname), upward = true })[1]
    if match then
        on_dir(vim.fs.dirname(match))
        return
    end

    local repository = vim.fs.root(bufnr, ".git")
    if not repository then
        return
    end

    -- Only tracked files count, so dependencies and build output cannot start the server. A new
    -- stylesheet counts after `git add`, because `--untracked` took 25 times longer in nixpkgs.
    vim.system({
        "git",
        "grep",
        "--quiet",
        "-E",
        "-e",
        TAILWIND_STYLESHEET_PATTERN,
        "--",
        "*.css",
        "*.scss",
        "*.sass",
        "*.less",
        "*.pcss",
    }, { cwd = repository }, function(result)
        if result.code == 0 then
            on_dir(repository)
        end
    end)
end

local function nix_string(value)
    local escaped = value:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("%${", "\\${")
    return '"' .. escaped .. '"'
end

local function read_file(path)
    local file = io.open(path, "r")
    if not file then
        return nil
    end
    local content = file:read("*a")
    file:close()
    return content
end

-- nixd settings for any repository root. nixpkgs comes from `flake.lock` through `fetchTree`, so
-- no repository is copied to the store for it. An option set needs `builtins.getFlake`, which
-- copies the repository, so a set is added only when `flake.nix` mentions its output.
local function nixd_flake_settings(root)
    local settings = {}
    local lock = root .. "/flake.lock"
    if vim.uv.fs_stat(lock) then
        settings.nixpkgs = {
            expr = string.format(
                [[
let
  lock = builtins.fromJSON (builtins.readFile %s);
  input = lock.nodes.${lock.root}.inputs.nixpkgs or null;
in
if builtins.isString input then import (builtins.fetchTree lock.nodes.${input}.locked) { }
else import <nixpkgs> { }]],
                nix_string(lock)
            ),
        }
    end

    local flake = read_file(root .. "/flake.nix")
    if not flake then
        return settings
    end

    local user = vim.uv.os_get_passwd().username
    -- `pick` prefers this machine's host or user, then the first entry, so it works in any flake.
    local prelude = string.format(
        [[
let
  flake = builtins.getFlake %s;
  pick = set: names:
    let found = builtins.filter (name: set ? ${name}) names;
    in
    if found != [ ] then set.${builtins.head found}
    else if set != { } then set.${builtins.head (builtins.attrNames set)}
    else null;
  host = %s;
  user = %s;
  nixos = pick (flake.nixosConfigurations or { }) [ host ];
  darwin = pick (flake.darwinConfigurations or { }) [ host ];
  system = pick ((flake.nixosConfigurations or { }) // (flake.darwinConfigurations or { })) [ host ];
  home = pick (flake.homeConfigurations or { }) [ "${user}@${host}" user ];
in
]],
        nix_string(root),
        nix_string(vim.uv.os_gethostname()),
        nix_string(user)
    )

    local option_sets = {
        {
            name = "nixos",
            patterns = { "nixosConfigurations" },
            expr = "if nixos == null then { } else nixos.options",
        },
        {
            name = "nix-darwin",
            patterns = { "darwinConfigurations" },
            expr = "if darwin == null then { } else darwin.options",
        },
        {
            name = "home-manager",
            patterns = { "homeConfigurations", "home%-manager" },
            expr = [[
if system != null && system.options ? home-manager then system.options.home-manager.users.type.getSubOptions [ ]
else if home != null then home.options
else { }]],
        },
        -- These exist only when the flake sets `debug = true`: https://flake.parts/debug
        { name = "flake-parts", patterns = { "flake%-parts" }, expr = "flake.debug.options or { }" },
        {
            name = "flake-parts-per-system",
            patterns = { "flake%-parts" },
            expr = "flake.currentSystem.options or { }",
        },
    }

    for _, option_set in ipairs(option_sets) do
        for _, pattern in ipairs(option_set.patterns) do
            if flake:find(pattern) then
                settings.options = settings.options or {}
                settings.options[option_set.name] = { expr = prelude .. option_set.expr }
                break
            end
        end
    end

    return settings
end

-- `devenv lsp --print-config` prints nixd settings with devenv's nixpkgs and options. It can take a
-- few seconds (it writes `devenv.lock` if the project has none), so it runs after the server starts
-- and the server then reads its settings again.
local function load_devenv_settings(client)
    local root = client.root_dir
    if not root or not vim.uv.fs_stat(root .. "/devenv.nix") or vim.fn.executable("devenv") ~= 1 then
        return
    end

    vim.system({ "devenv", "lsp", "--print-config" }, { cwd = root, text = true }, function(result)
        vim.schedule(function()
            if client:is_stopped() then
                return
            end
            local ok, config = pcall(vim.json.decode, result.stdout or "")
            if result.code ~= 0 or not ok or type(config) ~= "table" or not config.nixd then
                vim.notify(
                    "nixd: `devenv lsp --print-config` failed in " .. root .. "\n" .. (result.stderr or ""),
                    vim.log.levels.WARN
                )
                return
            end
            client.settings.nixd = vim.tbl_deep_extend("force", client.settings.nixd or {}, config.nixd)
            client:notify("workspace/didChangeConfiguration", { settings = client.settings })
        end)
    end)
end

return {
    -- basedpyright = {
    --     -- https://docs.basedpyright.com/latest/configuration/language-server-settings/
    --     settings = {
    --         basedpyright = {
    --             analysis = {
    --                 autoImportCompletions = true,
    --                 autoSearchPaths = true,
    --                 diagnosticMode = "workspace",
    --                 useLibraryCodeForTypes = true,
    --                 typeCheckingMode = "off",
    --                 ignore = { "*" },
    --                 diagnosticSeverityOverrides = {
    --                     reportGeneralTypeIssues = "information",
    --                 },
    --                 inlayHints = {
    --                     variableTypes = true,
    --                     callArgumentNames = true,
    --                     functionReturnTypes = true,
    --                     genericTypes = true,
    --                 },
    --             },
    --         },
    --     },
    --     on_attach = function(client, bufnr)
    --         vim.keymap.set("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { buffer = bufnr, desc = "Organize Imports" })
    --         disable_capabilities_for_server(client)
    --         -- check_basedpyright_deprecation()
    --     end,
    -- },
    bashls = {
        settings = {
            bashIde = {
                -- nvim-lint runs shellcheck. An empty path stops the server from running it again.
                shellcheckPath = "",
            },
        },
    },
    cssls = {},
    -- ctags_lsp = {
    --     cmd = { "ctags-lsp", "--languages", table.concat(require("peter.core.filetypes").ctags, ",") },
    --     filetypes = require("peter.core.filetypes").ctags,
    -- },
    -- https://docs.deno.com/runtime/reference/lsp_integration/
    denols = {
        settings = {
            deno = {
                inlayHints = {
                    parameterNames = { enabled = "all" },
                    parameterTypes = { enabled = true },
                    variableTypes = { enabled = true },
                    propertyDeclarationTypes = { enabled = true },
                    functionLikeReturnTypes = { enabled = true },
                    enumMemberValues = { enabled = true },
                },
            },
        },
        -- `vim.lsp.config` replaces `on_attach`, so this list keeps the nvim-lspconfig callback that
        -- creates `:LspDenolsCache`.
        on_attach = {
            vim.lsp.config.denols.on_attach,
            function(client, bufnr)
                vim.api.nvim_buf_create_user_command(bufnr, "DenoOrganizeImports", function()
                    vim.lsp.buf.code_action({
                        context = { only = { "source.organizeImports" } },
                        apply = true,
                    })
                end, { desc = "Organize Imports" })

                vim.keymap.set(
                    "n",
                    "gro",
                    "<CMD>DenoOrganizeImports<CR>",
                    { buffer = bufnr, desc = "Organize Imports" }
                )
            end,
        },
    },
    dockerls = {},
    docker_language_server = {
        init_options = {
            -- Telemetry is on by default. It sends hashed Git remotes and file paths, and crash
            -- reports to BugSnag: https://github.com/docker/docker-language-server/blob/main/TELEMETRY.md
            telemetry = "off",
        },
    },
    -- https://github.com/elixir-lsp/elixir-ls#elixirls-configuration-settings
    -- elixirls = {
    --     cmd = { "elixir-ls" },
    --     settings = {
    --         elixirLS = {
    --             enableInlayHints = true,
    --         },
    --     },
    -- },
    eslint = {},
    -- expert = {},
    fish_lsp = {},
    -- https://github.com/golang/tools/blob/master/gopls/doc/settings.md
    gopls = {
        settings = {
            gopls = {
                hints = {
                    assignVariableTypes = true,
                    compositeLiteralFields = true,
                    compositeLiteralTypes = true,
                    constantValues = true,
                    functionTypeParameters = true,
                    parameterNames = true,
                    rangeVariableTypes = true,
                },
            },
        },
    },
    harper_ls = {},
    html = {
        init_options = {
            provideFormatter = false,
        },
        settings = {
            html = {
                tagAutoclosing = true,
            },
        },
    },
    -- https://github.com/eclipse-jdtls/eclipse.jdt.ls/wiki/Running-the-JAVA-LS-server-from-the-command-line#initialize-request
    jdtls = {
        settings = {
            java = {
                inlayHints = {
                    parameterNames = {
                        enabled = "all",
                    },
                },
            },
        },
    },
    jsonls = {
        lazy = true,
        filetypes = { "json", "jsonc" },
        config = function()
            local sc = require("schema-companion")
            return sc.setup_client(
                sc.adapters.jsonls.setup({
                    sources = {
                        sc.sources.lsp.setup(),
                        sc.sources.none.setup(),
                    },
                }),
                {
                    init_options = {
                        provideFormatter = false,
                    },
                    settings = {
                        json = {
                            validate = { enable = true },
                            schemas = require("schemastore").json.schemas(),
                        },
                    },
                }
            )
        end,
    },
    lua_ls = {},
    -- marksman = {},
    -- mpls = {
    --     cmd = {
    --         "mpls",
    --         "--theme",
    --         "light",
    --         "--enable-emoji",
    --         "--enable-footnotes",
    --         "--no-auto",
    --         "--tabs",
    --     },
    -- },
    -- https://github.com/nix-community/nixd/blob/main/nixd/docs/configuration.md
    nixd = {
        -- A flake or devenv project root wins over the enclosing Git root.
        root_markers = { { "flake.nix", "devenv.nix" }, ".git" },
        settings = {
            nixd = {},
        },
        before_init = function(_, config)
            -- The client serves this same table to the server, so the change must be in place.
            if config.root_dir then
                local nixd = config.settings.nixd
                for key, value in pairs(nixd_flake_settings(config.root_dir)) do
                    nixd[key] = value
                end
            end
        end,
        on_init = load_devenv_settings,
    },
    -- https://pyrefly.org/en/docs/IDE/
    pyrefly = {
        capabilities = {
            workspace = {
                didChangeWatchedFiles = {
                    -- Neovim leaves this off on Linux, and pyrefly cannot see edits made outside
                    -- the editor without it.
                    dynamicRegistration = true,
                },
            },
        },
        handlers = make_unique_file_watcher_handlers(),
        init_options = {
            pyrefly = {
                typeCheckingMode = "default",
            },
        },
        settings = {
            python = {
                analysis = {
                    inlayHints = {
                        variableTypes = true,
                        functionReturnTypes = true,
                        callArgumentNames = "all",
                    },
                },
            },
        },
        on_attach = function(client, bufnr)
            disable_capabilities_for_server(client)
        end,
    },
    qmlls = {
        lazy = true,
        filetypes = { "qml", "qmljs" },
    },
    ruff = {
        -- capabilities = {
        --     general = {
        --         positionEncodings = { "utf-16" },
        --     },
        -- },
        init_options = {
            settings = {
                configuration = vim.fn.expand("$HOME/.config/nvim/code/ruff.toml"),
                -- A project's own Ruff config wins. The file above applies only when a project has none.
                configurationPreference = "filesystemFirst",
                organizeImports = true,
                showSyntaxErrors = true,
                codeAction = {
                    disableRuleComment = { enable = false },
                    fixViolation = { enable = false },
                },
                format = {
                    preview = false,
                },
                lint = {
                    enable = true,
                },
            },
        },
        on_attach = function(client, bufnr)
            local function exec_document_cmd(command)
                -- The server rejects a stale `version`, so send the real buffer version.
                local version = vim.lsp.util.buf_versions[bufnr]
                if version == nil then
                    version = vim.api.nvim_buf_get_changedtick(bufnr)
                end
                client:exec_cmd({
                    command = command,
                    arguments = { { uri = vim.uri_from_bufnr(bufnr), version = version } },
                })
            end

            vim.api.nvim_buf_create_user_command(bufnr, "RuffAutoFix", function()
                exec_document_cmd("ruff.applyAutofix")
            end, { desc = "Auto-fix" })

            vim.api.nvim_buf_create_user_command(bufnr, "RuffOrganizeImports", function()
                exec_document_cmd("ruff.applyOrganizeImports")
            end, { desc = "Organize Imports" })

            vim.keymap.set("n", "gro", "<CMD>RuffOrganizeImports<CR>", { buffer = bufnr, desc = "Organize Imports" })

            disable_capabilities_for_server(client)
        end,
    },
    -- rust_analyzer = {},
    superhtml = {},
    tailwindcss = {
        root_dir = tailwind_root_dir,
        settings = {
            tailwindCSS = {
                includeLanguages = {
                    templ = "html",
                },
            },
        },
    },
    templ = {},
    terraformls = {},
    -- https://myriad-dreamin.github.io/tinymist/config/neovim.html
    tinymist = {},
    tflint = {},
    tombi = {
        lazy = true,
        filetypes = { "toml" },
        config = function()
            local sc = require("schema-companion")
            return sc.setup_client(sc.adapters.tombi.setup({
                sources = {
                    sc.sources.lsp.setup(),
                    sc.sources.none.setup(),
                },
            }))
        end,
    },
    -- https://github.com/microsoft/TypeScript/blob/release-6.0/src/server/protocol.ts (search for InlayHintsOptions)
    -- ts_ls = {
    --     settings = {
    --         typescript = {
    --             inlayHints = {
    --                 parameterNames = { enabled = "all" },
    --                 parameterTypes = { enabled = true },
    --                 variableTypes = { enabled = true },
    --                 propertyDeclarationTypes = { enabled = true },
    --                 functionLikeReturnTypes = { enabled = true },
    --                 enumMemberValues = { enabled = true },
    --             },
    --         },
    --         javascript = {
    --             inlayHints = {
    --                 parameterNames = { enabled = "all" },
    --                 parameterTypes = { enabled = true },
    --                 variableTypes = { enabled = true },
    --                 propertyDeclarationTypes = { enabled = true },
    --                 functionLikeReturnTypes = { enabled = true },
    --                 enumMemberValues = { enabled = true },
    --             },
    --         },
    --     },
    --     on_attach = function(client, bufnr)
    --         vim.api.nvim_buf_create_user_command(bufnr, "TSServerOrganizeImports", function()
    --             client:exec_cmd({
    --                 command = "_typescript.organizeImports",
    --                 arguments = { vim.api.nvim_buf_get_name(0) },
    --             })
    --         end, { desc = "Organize Imports" })
    --
    --         vim.keymap.set(
    --             "n",
    --             "gro",
    --             "<CMD>TSServerOrganizeImports<CR>",
    --             { buffer = bufnr, desc = "Organize Imports" }
    --         )
    --     end,
    -- },
    -- https://docs.astral.sh/ty/reference/editor-settings/
    -- ty = {
    --     settings = {
    --         ty = {
    --             inlayHints = {
    --                 variableTypes = true,
    --                 callArgumentNames = true,
    --             },
    --         },
    --     },
    --     on_attach = function(client, bufnr)
    --         disable_capabilities_for_server(client)
    --     end,
    -- },
    tsc = {},
    typos_lsp = {
        init_options = {
            diagnosticSeverity = "information",
        },
    },
    -- -- https://github.com/yioneko/vtsls/blob/main/packages/service/configuration.schema.json
    -- vtsls = {
    --     lazy = true,
    --     filetypes = {
    --         "javascript",
    --         "javascriptreact",
    --         "javascript.jsx",
    --         "typescript",
    --         "typescriptreact",
    --         "typescript.tsx",
    --     },
    --     config = function()
    --         local config = {
    --             init_options = {
    --                 hostInfo = "neovim",
    --             },
    --             settings = {
    --                 vtsls = {
    --                     autoUserWorkspaceTsdk = true,
    --                     experimental = {
    --                         completion = { enableServerSideFuzzyMatch = true },
    --                     },
    --                 },
    --                 typescript = {
    --                     inlayHints = {
    --                         parameterNames = { enabled = "all" },
    --                         parameterTypes = { enabled = true },
    --                         variableTypes = { enabled = true },
    --                         propertyDeclarationTypes = { enabled = true },
    --                         functionLikeReturnTypes = { enabled = true },
    --                         enumMemberValues = { enabled = true },
    --                     },
    --                 },
    --                 javascript = {
    --                     inlayHints = {
    --                         parameterNames = { enabled = "all" },
    --                         parameterTypes = { enabled = true },
    --                         variableTypes = { enabled = true },
    --                         propertyDeclarationTypes = { enabled = true },
    --                         functionLikeReturnTypes = { enabled = true },
    --                         enumMemberValues = { enabled = true },
    --                     },
    --                 },
    --             },
    --             on_attach = function(client, bufnr)
    --                 vim.api.nvim_buf_create_user_command(bufnr, "VtslsOrganizeImports", function()
    --                     client:exec_cmd({
    --                         command = "typescript.organizeImports",
    --                         arguments = { vim.api.nvim_buf_get_name(0) },
    --                     })
    --                 end, { desc = "Organize Imports" })
    --
    --                 vim.keymap.set(
    --                     "n",
    --                     "gro",
    --                     "<CMD>VtslsOrganizeImports<CR>",
    --                     { buffer = bufnr, desc = "Organize Imports" }
    --                 )
    --             end,
    --         }
    --
    --         local yarn_sdks = vim.fs.find({ "sdks" }, { type = "directory", path = ".yarn" })
    --         if #yarn_sdks > 0 then
    --             config.settings.vtsls.typescript = {
    --                 globalTsdk = "./.yarn/sdks/typescript/lib",
    --             }
    --         end
    --
    --         return config
    --     end,
    -- },
    yamlls = {
        lazy = true,
        filetypes = { "yaml", "yaml.docker-compose" },
        config = function()
            local sc = require("schema-companion")
            return sc.setup_client(
                sc.adapters.yamlls.setup({
                    sources = {
                        sc.sources.lsp.setup(),
                        sc.sources.none.setup(),
                    },
                })
                -- {
                --     settings = {
                --         yaml = {
                --             schemaStore = {
                --                 enable = false,
                --                 url = "",
                --             },
                --             schemas = require("schemastore").yaml.schemas(),
                --         },
                --     },
                -- }
            )
        end,
    },
}

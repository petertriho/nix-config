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
        ty = false,
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
        active = "ruff",
        basedpyright = false,
        pyrefly = false,
        ruff = true,
        ty = false,
    },
    documentRangeFormattingProvider = {
        active = "ruff",
        basedpyright = false,
        pyrefly = false,
        ruff = true,
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

return {
    atlas = {
        lazy = true,
        filetypes = {
            "atlas-*",
        },
    },
    -- basedpyright = {
    --     settings = {
    --         basedpyright = {
    --             analysis = {
    --                 autoImportCompletions = true,
    --                 autoSearchPaths = true,
    --                 diagnosticMode = "workspace",
    --                 useLibraryCodeForTypes = true,
    --                 -- typeCheckingMode = "off",
    --                 -- ignore = { "*" },
    --                 diagnosticSeverityOverrides = {
    --                     reportGeneralTypeIssues = "information",
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
    bashls = {},
    cssls = {},
    denols = {},
    dockerls = {},
    docker_compose_language_service = {},
    elixirls = {
        cmd = { "elixir-ls" },
    },
    emmet_language_server = {
        filetypes = {
            "css",
            "eruby",
            "html",
            "htmldjango",
            "javascriptreact",
            "less",
            "pug",
            "sass",
            "scss",
            "typescriptreact",
            "htmlangular",
            -- additional filetypes
            "javascript",
            "javascript.jsx",
            "typescript",
            "typescript.tsx",
            "xml",
        },
    },
    eslint = {},
    -- expert = {},
    fish_lsp = {},
    gopls = {},
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
    jdtls = {},
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
    marksman = {},
    mpls = {
        cmd = {
            "mpls",
            "--enable-emoji",
            "--enable-footnotes",
            "--no-auto",
        },
        root_markers = { ".marksman.toml", ".git" },
        filetypes = { "markdown", "makdown.mdx" },
        on_attach = function(client, bufnr)
            vim.api.nvim_buf_create_user_command(bufnr, "OpenPreview", function()
                local params = {
                    command = "open-preview",
                }
                client:request("workspace/executeCommand", params, function(err, _)
                    if err then
                        vim.notify("Error executing command: " .. err.message, vim.log.levels.ERROR)
                    else
                        vim.notify("Preview opened", vim.log.levels.INFO)
                    end
                end)
            end, {
                desc = "Open Preview",
            })

            vim.keymap.set("n", "gro", "<CMD>OpenPreview<CR>", { buffer = bufnr, desc = "Open Preview" })
        end,
    },
    nil_ls = {
        settings = {
            ["nil"] = {
                nix = {
                    flake = {
                        autoArchive = false,
                    },
                },
            },
        },
    },
    postgres_lsp = {},
    pyrefly = {
        init_options = {
            pyrefly = {
                displayTypeErrors = "force-on",
            },
        },
        on_attach = function(client, bufnr)
            disable_capabilities_for_server(client)
        end,
    },
    -- quick_lint_js = {
    --     filetypes = {
    --         "javascript",
    --         "javascriptreact",
    --         "javascript.jsx",
    --         "typescript",
    --         "typescriptreact",
    --         "typescript.tsx",
    --     },
    -- },
    qmlls = {
        lazy = true,
        filetypes = { "qml", "qtquick" },
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
            vim.api.nvim_buf_create_user_command(bufnr, "RuffAutoFix", function()
                client:exec_cmd({
                    command = "ruff.applyAutofix",
                    arguments = {
                        { uri = vim.uri_from_bufnr(0) },
                    },
                })
            end, { desc = "Auto-fix" })

            vim.api.nvim_buf_create_user_command(bufnr, "RuffOrganizeImports", function()
                client:exec_cmd({
                    command = "ruff.applyOrganizeImports",
                    arguments = { { uri = vim.uri_from_bufnr(0), version = 123 } },
                })
            end, { desc = "Organize Imports" })

            vim.keymap.set("n", "gro", "<CMD>RuffOrganizeImports<CR>", { buffer = bufnr, desc = "Organize Imports" })

            disable_capabilities_for_server(client)
        end,
    },
    -- rust_analyzer = {},
    superhtml = {},
    svelte = {},
    tailwindcss = {},
    taplo = {
        lazy = true,
        filetypes = { "toml" },
        config = function()
            local sc = require("schema-companion")
            return sc.setup_client(sc.adapters.taplo.setup({
                sources = {
                    sc.sources.lsp.setup(),
                    sc.sources.none.setup(),
                },
            }))
        end,
    },
    terraformls = {},
    tinymist = {},
    tflint = {},
    -- ts_ls = {
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
    ty = {
        on_attach = function(client, bufnr)
            disable_capabilities_for_server(client)
        end,
    },
    typos_lsp = {
        init_options = {
            diagnosticSeverity = "information",
        },
    },
    vtsls = {
        lazy = true,
        filetypes = {
            "javascript",
            "javascriptreact",
            "javascript.jsx",
            "typescript",
            "typescriptreact",
            "typescript.tsx",
        },
        config = function()
            local config = {
                init_options = {
                    hostInfo = "neovim",
                },
                settings = {
                    vtsls = {
                        autoUserWorkspaceTsdk = true,
                        experimental = {
                            completion = { enableServerSideFuzzyMatch = true },
                        },
                    },
                },
                on_attach = function(client, bufnr)
                    vim.api.nvim_buf_create_user_command(bufnr, "VtslsOrganizeImports", function()
                        client:exec_cmd({
                            command = "typescript.organizeImports",
                            arguments = { vim.api.nvim_buf_get_name(0) },
                        })
                    end, { desc = "Organize Imports" })

                    vim.keymap.set(
                        "n",
                        "gro",
                        "<CMD>VtslsOrganizeImports<CR>",
                        { buffer = bufnr, desc = "Organize Imports" }
                    )
                end,
            }

            local yarn_sdks = vim.fs.find({ "sdks" }, { type = "directory", path = ".yarn" })
            if #yarn_sdks > 0 then
                config.settings.vtsls.typescript = {
                    globalTsdk = "./.yarn/sdks/typescript/lib",
                }
            end

            return config
        end,
    },
    yamlls = {
        lazy = true,
        filetypes = { "yaml", "yml" },
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

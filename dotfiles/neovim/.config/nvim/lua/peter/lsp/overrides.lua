local vtsls_setup = function(config)
    -- NOTE: workaround for https://yarnpkg.com/getting-started/editor-sdks
    local yarn_sdks = vim.fs.find({ "sdks" }, { type = "directory", path = ".yarn" })
    if #yarn_sdks > 0 then
        config.settings.vtsls.typescript = {
            globalTsdk = "./.yarn/sdks/typescript/lib",
        }
    end

    return config
end

return {
    basedpyright = {
        settings = {
            basedpyright = {
                analysis = {
                    autoSearchPaths = true,
                    diagnosticMode = "workspace",
                    useLibraryCodeForTypes = true,
                    typeCheckingMode = "off",
                    ignore = { "*" },
                    diagnosticSeverityOverrides = {
                        reportGeneralTypeIssues = "information",
                    },
                },
            },
        },
        on_attach = function(client, bufnr)
            vim.keymap.set("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { buffer = bufnr, desc = "Organize Imports" })
            -- Disable server_capabilities, use pyrefly instead
            client.server_capabilities.renameProvider = false
            client.server_capabilities.semanticTokensProvider = nil
        end,
    },
    bashls = {},
    cssls = {},
    dockerls = {},
    docker_compose_language_service = {},
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
                client.request("workspace/executeCommand", params, function(err, _)
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
    pyrefly = {},
    quick_lint_js = {
        filetypes = {
            "javascript",
            "javascriptreact",
            "javascript.jsx",
            "typescript",
            "typescriptreact",
            "typescript.tsx",
        },
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
        end,
    },
    -- rust_analyzer = {},
    -- pylyzer = {},
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
    ty = {},
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
            local publish_diagnostics_handler =
                vim.lsp.handlers[vim.lsp.protocol.Methods.textDocument_publishDiagnostics]
            vim.lsp.handlers[vim.lsp.protocol.Methods.textDocument_publishDiagnostics] = function(err, result, ctx)
                require("ts-error-translator").translate_diagnostics(err, result, ctx)
                publish_diagnostics_handler(err, result, ctx)
            end
            return vtsls_setup({
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
            })
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

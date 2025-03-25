local execute_command = function(client_name, params)
    local clients = require("lspconfig.util").get_lsp_clients({
        bufnr = vim.api.nvim_get_current_buf(),
        name = client_name,
    })
    for _, client in ipairs(clients) do
        client.request("workspace/executeCommand", params, nil, 0)
    end
end

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
    -- angularls = {},
    basedpyright = {
        settings = {
            basedpyright = {
                analysis = {
                    autoSearchPaths = true,
                    diagnosticMode = "workspace",
                    useLibraryCodeForTypes = true,
                    typeCheckingMode = "standard",
                    diagnosticSeverityOverrides = {
                        reportGeneralTypeIssues = "information",
                    },
                },
            },
        },
    },
    bashls = {},
    cssls = {},
    dockerls = {},
    docker_compose_language_service = {},
    -- emmet_language_server = {
    --     filetypes = {
    --         "css",
    --         "eruby",
    --         "html",
    --         "htmldjango",
    --         "javascriptreact",
    --         "less",
    --         "pug",
    --         "sass",
    --         "scss",
    --         "typescriptreact",
    --         "htmlangular",
    --         -- additional filetypes
    --         "javascript",
    --         "javascript.jsx",
    --         "typescript",
    --         "typescript.tsx",
    --         "xml",
    --     },
    -- },
    eslint = {},
    fish_lsp = {},
    gopls = {},
    html = {
        init_options = {
            provideFormatter = false,
        },
    },
    jdtls = {},
    jsonls = {
        init_options = {
            provideFormatter = false,
        },
        settings = {
            json = {
                validate = { enable = true },
                schemas = require("schemastore").json.schemas(),
            },
        },
    },
    lua_ls = {},
    marksman = {},
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
        capabilities = {
            general = {
                positionEncodings = { "utf-16" },
            },
        },
        init_options = {
            settings = {
                configuration = vim.fn.expand("$HOME/.config/nvim/code/ruff.toml"),
            },
        },
        commands = {
            RuffAutoFix = {
                function()
                    execute_command("ruff", {
                        command = "ruff.applyAutofix",
                        arguments = {
                            { uri = vim.uri_from_bufnr(0) },
                        },
                    })
                end,
                description = "Auto-fix",
            },
            RuffOrganizeImports = {
                function()
                    execute_command("ruff", {
                        command = "ruff.applyOrganizeImports",
                        arguments = { { uri = vim.uri_from_bufnr(0), version = 123 } },
                    })
                end,
                description = "Organize Imports",
            },
        },
    },
    rust_analyzer = {},
    -- pylyzer = {},
    superhtml = {},
    svelte = {},
    tailwindcss = {},
    taplo = {},
    terraformls = {},
    tflint = {},
    -- ts_ls = {
    --     commands = {
    --         TSServerOrganizeImports = {
    --             function()
    --                 execute_command("ts_ls", {
    --                     command = "_typescript.organizeImports",
    --                     arguments = { vim.api.nvim_buf_get_name(0) },
    --                 })
    --             end,
    --             description = "Organize Imports",
    --         },
    --     },
    -- },
    typos_lsp = {
        init_options = {
            diagnosticSeverity = "information",
        },
    },
    vtsls = vtsls_setup({
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
        commands = {
            VtslsOrganizeImports = {
                function()
                    execute_command("vtsls", {
                        command = "typescript.organizeImports",
                        arguments = { vim.api.nvim_buf_get_name(0) },
                    })
                end,
                description = "Organize Imports",
            },
        },
    }),
    yamlls = require("yaml-companion").setup({ lspconfig = {} }),
}

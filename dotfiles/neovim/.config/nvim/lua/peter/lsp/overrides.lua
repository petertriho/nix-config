local execute_command = function(client_name, params)
    local clients = require("lspconfig.util").get_lsp_clients({
        bufnr = vim.api.nvim_get_current_buf(),
        name = client_name,
    })
    for _, client in ipairs(clients) do
        client.request("workspace/executeCommand", params, nil, 0)
    end
end

return {
    angularls = {},
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
    biome = {},
    cssls = {},
    dockerls = {},
    docker_compose_language_service = {},
    emmet_language_server = {
        filetypes = {
            "css",
            "html",
            "sass",
            "scss",
            "xml",
            "jsx",
            "tsx",
            "javascript",
            "typescript",
        },
    },
    eslint = {},
    fish_lsp = {},
    gopls = {},
    graphql = {
        filetypes = { "graphql" },
    },
    html = {
        init_options = {
            provideFormatter = false,
        },
    },
    htmx = {},
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
        filetypes = { "javascript", "javascriptreact", "jsx" },
    },
    ruff = {
        capabilities = {
            general = {
                positionEncodings = { "utf-16" },
            },
        },
        settings = {
            "configuration",
            vim.fn.expand("$HOME/.config/nvim/code/.ruff.toml"),
        },
        commands = {
            RuffAutoFix = {
                function()
                    execute_command("ruff", {
                        command = "ruff.applyAutofix",
                        arguments = {
                            { uri = vim.uri_from_bufnr(bufnr) },
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
    -- superhtml = {},
    svelte = {},
    tailwindcss = {
        settings = {
            tailwindCSS = {
                experimental = {
                    classRegex = {
                        "[\\w]*[cC]lass[\\w]*\\s*[:=]\\s*[{\"'`]+(.*)[\"'`}]+",
                    },
                },
            },
        },
    },
    taplo = {},
    terraformls = {},
    tflint = {},
    ts_ls = {
        commands = {
            TSServerOrganizeImports = {
                function()
                    execute_command("ts_ls", {
                        command = "_typescript.organizeImports",
                        arguments = { vim.api.nvim_buf_get_name(0) },
                    })
                end,
                description = "Organize Imports",
            },
        },
    },
    yamlls = {},
}

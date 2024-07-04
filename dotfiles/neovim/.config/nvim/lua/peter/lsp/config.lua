return {
    basedpyright = {
        python = {
            analysis = {
                diagnosticMode = "workspace",
                useLibraryCodeForTypes = true,
                diagnosticSeverityOverrides = {
                    reportGeneralTypeIssues = "information",
                },
            },
        },
    },
    bashls = {},
    cssls = {},
    dockerls = {},
    emmet_language_server = {
        filetypes = {
            "css",
            "html",
            "sass",
            "scss",
            "xml",
        },
    },
    eslint = {},
    fish_lsp = {
        cmd_env = {
            fish_lsp_show_client_popups = false,
            fish_lsp_logfile = "/tmp/fish_lsp_logs.txt",
        },
    },
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
    ltex = {
        filetypes = { "bib", "markdown", "org", "plaintex", "rst", "rnoweb", "tex" },
    },
    lua_ls = {},
    marksman = {},
    nil_ls = {},
    quick_lint_js = {
        filetypes = { "javascript", "javascriptreact", "jsx" },
    },
    ruff = {
        settings = {
            "configuration",
            vim.fn.expand("$HOME/.config/code/.ruff.toml"),
        },
        commands = {
            RuffOrganizeImports = {
                function()
                    local params = {
                        command = "ruff.applyOrganizeImports",
                        arguments = { vim.api.nvim_buf_get_name(0) },
                    }
                    vim.lsp.buf.execute_command(params)
                end,
                description = "Organize Imports",
            },
        },
    },
    rust_analyzer = {},
    -- pylyzer = {}, -- NOTE: disabled until virtualenv imports is supported
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
    tsserver = {
        commands = {
            TSServerOrganizeImports = {
                function()
                    local params = {
                        command = "_typescript.organizeImports",
                        arguments = { vim.api.nvim_buf_get_name(0) },
                    }
                    vim.lsp.buf.execute_command(params)
                end,
                description = "Organize Imports",
            },
        },
    },
    yamlls = {},
}

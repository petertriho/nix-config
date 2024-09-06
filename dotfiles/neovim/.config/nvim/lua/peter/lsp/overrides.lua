return {
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
                        -- NOTE: bug with str, int, etc being reported as undefined
                        reportUndefinedVariable = "none",
                    },
                },
            },
        },
    },
    bashls = {},
    biome = {},
    cssls = {},
    dockerls = {},
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
        settings = {
            "configuration",
            vim.fn.expand("$HOME/.config/nvim/code/.ruff.toml"),
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
    ts_ls = {
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

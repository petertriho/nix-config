local M = {}

local null_ls = require("null-ls")

local h = require("null-ls.helpers")
local methods = require("null-ls.methods")

local DIAGNOSTICS = methods.internal.DIAGNOSTICS
local FORMATTING = methods.internal.FORMATTING
local RANGE_FORMATTING = methods.internal.RANGE_FORMATTING

local sources_diagnostics = {
    bandit = h.make_builtin({
        method = DIAGNOSTICS,
        filetypes = { "python" },
        generator_opts = {
            command = "bandit",
            args = {
                "--skip",
                -- B101: assert_used
                "B101",
                "--format",
                "json",
                "-",
            },
            to_stdin = true,
            from_stderr = false,
            ignore_stderr = true,
            format = "json",
            check_exit_code = { 0, 1 },
            on_output = function(params)
                if #params.output.results == 0 then
                    return {}
                end

                local parser = h.diagnostics.from_json({
                    attributes = {
                        row = "line_number",
                        col = "col_offset",
                        code = "test_id",
                        message = "issue_text",
                        severity = "issue_severity",
                    },
                    offsets = { col = 1 },
                    severities = {
                        HIGH = h.diagnostics.severities.error,
                        MEDIUM = h.diagnostics.severities.warning,
                        LOW = h.diagnostics.severities.information,
                        UNDEFINED = h.diagnostics.severities.hint,
                    },
                })

                return parser({ output = params.output.results })
            end,
        },
        factory = h.generator_factory,
    }),
    jq = h.make_builtin({
        method = DIAGNOSTICS,
        filetypes = { "json", "jsonc" },
        generator_opts = {
            command = "jq",
            args = {
                ".",
            },
            to_stdin = true,
            from_stderr = true,
            format = "line",
            on_output = h.diagnostics.from_pattern(
                [[parse (%w+):(%w+) at line (%d+), column (%d+)]],
                { "severity", "message", "row", "col" },
                {
                    adapters = {
                        h.diagnostics.adapters.end_col.from_length,
                    },
                    severities = {
                        error = h.diagnostics.severities.error,
                    },
                }
            ),
        },
        factory = h.generator_factory,
    }),
    refurb = h.make_builtin({
        method = DIAGNOSTICS,
        filetypes = { "python" },
        generator_opts = {
            command = "refurb",
            args = {
                "$FILENAME",
                "--disable",
                -- FURB109: Replace [] with ()
                "FURB109",
            },
            from_stderr = true,
            format = "line",
            on_output = h.diagnostics.from_pattern([[:(%d+):(%d+) (.+)]], { "row", "col", "message" }, {}),
        },
        factory = h.generator_factory,
    }),
}

local sources_formatting = {
    autoflake = h.make_builtin({
        method = FORMATTING,
        filetypes = { "python" },
        generator_opts = {
            command = "autoflake",
            args = {
                "--remove-all-unused-imports",
                "--stdin-display-name",
                "$FILENAME",
                "-",
            },
            to_stdin = true,
        },
        factory = h.formatter_factory,
    }),
    docformatter = h.make_builtin({
        method = { FORMATTING, RANGE_FORMATTING },
        filetypes = { "python" },
        generator_opts = {
            command = "docformatter",
            args = h.range_formatting_args_factory({
                "-",
            }, "--range", nil, { use_rows = true }),
            to_stdin = true,
        },
        factory = h.formatter_factory,
    }),
    -- for black versions that do not accept stdin
    black = h.make_builtin({
        method = FORMATTING,
        filetypes = { "python" },
        generator_opts = {
            command = "black",
            args = {
                "--quiet",
                "$FILENAME",
            },
            to_temp_file = true,
        },
        factory = h.formatter_factory,
    }),
    pybetter = h.make_builtin({
        method = FORMATTING,
        filetypes = { "python" },
        generator_opts = {
            command = "pybetter",
            args = {
                "--exclude",
                -- B002: Default values for kwargs are mutable.
                -- B004: __all__ attribute is missing.
                "B002,B004",
                "$FILENAME",
            },
            to_temp_file = true,
        },
        factory = h.formatter_factory,
    }),
    reorder_python_imports = h.make_builtin({
        method = FORMATTING,
        filetypes = { "python" },
        generator_opts = {
            command = "reorder-python-imports",
            args = { "-", "--exit-zero-even-if-changed" },
            to_stdin = true,
        },
        factory = h.formatter_factory,
    }),
    sort_package_json = h.make_builtin({
        method = FORMATTING,
        filetypes = { "json" },
        generator_opts = {
            command = "sort-package-json",
            args = {
                "$FILENAME",
            },
            to_temp_file = true,
            runtime_condition = function(params)
                return params.bufname:lower():match("[/\\]package.json$")
            end,
        },
        factory = h.formatter_factory,
    }),
    ssort = h.make_builtin({
        method = FORMATTING,
        filetypes = { "python" },
        generator_opts = {
            command = "ssort",
            args = {
                "$FILENAME",
            },
            to_temp_file = true,
        },
        factory = h.formatter_factory,
    }),
    svgo = h.make_builtin({
        method = FORMATTING,
        filetypes = { "svg" },
        generator_opts = {
            command = "svgo",
            args = {
                "--pretty",
                "-i",
                "$FILENAME",
                "-o",
                "-",
            },
        },
        factory = h.formatter_factory,
    }),
}

local b = require("null-ls.builtins")

local u = require("null-ls.utils")
local conditional = u.make_conditional_utils()

local check_if_black_accepts_stdin = function()
    local black_version = string.match(vim.fn.system("black --version"), "([%d%.]+%a*%d*)")
    return black_version >= "21.4b0"
end

local PYTHON_VERSION = nil

local get_python_version = function()
    if PYTHON_VERSION == nil then
        PYTHON_VERSION = { string.match(vim.fn.system("python --version"), "(%d+)%.(%d+)%.(%d+)") }
        if PYTHON_VERSION and #PYTHON_VERSION <= 0 then
            PYTHON_VERSION = { 0, 0, 0 }
        else
            for i, v in ipairs(PYTHON_VERSION) do
                PYTHON_VERSION[i] = tonumber(v)
            end
        end
    end
    return PYTHON_VERSION
end

local custom_user_data = {
    user_data = function(entries, _)
        if not entries then
            return
        end

        local suggestions = {}
        for suggestion in string.gmatch(entries["_suggestions"], "[^, ]+") do
            table.insert(suggestions, suggestion)
        end

        return {
            suggestions = suggestions,
            misspelled = entries["_quote"],
        }
    end,
}

M.setup = function(overrides)
    local cspell = require("cspell")
    local cspell_file = vim.fn.expand("$HOME/.config/code/.cspell.json")

    local spell_disabled_filestypes = { "markdown", "vimwiki", unpack(require("peter.plugins.filetypes").excludes) }

    local config = vim.tbl_deep_extend("force", {
        sources = {
            -- *
            b.diagnostics.codespell.with({
                disabled_filetypes = spell_disabled_filestypes,
            }),
            cspell.diagnostics.with({
                extra_args = {
                    "--config",
                    cspell_file,
                },
                disabled_filetypes = spell_disabled_filestypes,
                on_output = h.diagnostics.from_patterns({
                    {
                        pattern = ".*:(%d+):(%d+)%s*(-)%s*(.*%((.*)%))%s*Suggestions:%s*%[(.*)%]",
                        groups = { "row", "col", "severity", "message", "_quote", "_suggestions" },
                        overrides = {
                            severities = {
                                ["-"] = h.diagnostics.severities.information,
                            },
                            adapters = {
                                h.diagnostics.adapters.end_col.from_quote,
                                custom_user_data,
                            },
                        },
                    },
                    {
                        pattern = [[.*:(%d+):(%d+)%s*(-)%s*(.*%((.*)%))]],
                        groups = { "row", "col", "severity", "message", "_quote" },
                        overrides = {
                            severities = {
                                ["-"] = h.diagnostics.severities.information,
                            },
                            adapters = {
                                h.diagnostics.adapters.end_col.from_quote,
                            },
                        },
                    },
                }),
            }),
            cspell.code_actions.with({
                extra_args = {
                    "--config",
                    cspell_file,
                },
                disabled_filetypes = spell_disabled_filestypes,
            }),
            b.hover.dictionary,
            -- conf
            b.diagnostics.dotenv_linter.with({
                filetypes = { "sh", "conf" },
            }),
            -- dockerfile
            b.diagnostics.hadolint,
            -- fish
            b.diagnostics.fish,
            b.formatting.fish_indent,
            -- html/xml
            b.diagnostics.tidy,
            b.formatting.tidy,
            -- java
            b.formatting.google_java_format,
            -- json
            sources_diagnostics.jq,
            sources_formatting.sort_package_json,
            require("none-ls.formatting.jq"),
            -- lua
            b.diagnostics.selene.with({
                condition = function(utils)
                    return utils.root_has_file({ "selene.toml", ".selene.toml" })
                end,
            }),
            b.formatting.stylua.with({
                extra_args = function(params)
                    local extra_args = {}

                    if not conditional.root_has_file({ "stylua.toml", ".stylua.toml" }) then
                        extra_args = {
                            "--config-path",
                            vim.fn.expand("$HOME/.config/code/.stylua.toml"),
                        }
                    end

                    return extra_args
                end,
            }),
            -- nix
            b.formatting.alejandra,
            -- python
            sources_diagnostics.bandit,
            sources_diagnostics.refurb,
            sources_formatting.autoflake,
            sources_formatting.docformatter.with({
                condition = function(utils)
                    return get_python_version()[2] >= 9
                end,
            }),
            sources_formatting.ssort.with({
                condition = function(utils)
                    return get_python_version()[2] >= 9
                end,
            }),
            sources_formatting.reorder_python_imports.with({
                extra_args = function(params)
                    local extra_args = {}

                    get_python_version()
                    if PYTHON_VERSION[1] >= 3 then
                        if PYTHON_VERSION[2] >= 10 then
                            table.insert(extra_args, "--py310-plus")
                        elseif PYTHON_VERSION[2] >= 9 then
                            table.insert(extra_args, "--py39-plus")
                        elseif PYTHON_VERSION[2] >= 8 then
                            table.insert(extra_args, "--py38-plus")
                        elseif PYTHON_VERSION[2] >= 7 then
                            table.insert(extra_args, "--py37-plus")
                        elseif PYTHON_VERSION[2] >= 6 then
                            table.insert(extra_args, "--py36-plus")
                        else
                            table.insert(extra_args, "--py3-plus")
                        end
                    end

                    return extra_args
                end,
            }),
            b.formatting.isort.with({
                extra_args = function(params)
                    local extra_args = { "--profile", "black" }

                    get_python_version()
                    if PYTHON_VERSION[2] < 9 then
                        table.insert(extra_args, "--sl")
                    end

                    return extra_args
                end,
            }),
            sources_formatting.black.with({
                condition = function(utils)
                    return not check_if_black_accepts_stdin()
                end,
            }),
            b.formatting.black.with({
                condition = function(utils)
                    return check_if_black_accepts_stdin()
                end,
            }),
            -- shell
            b.formatting.shfmt.with({
                extra_args = function(params)
                    local extra_args = {
                        "-s",
                        "-bn",
                        "-ci",
                        "-sr",
                        "-kp",
                    }

                    if params.options and params.options.insertSpaces and params.options.tabSize then
                        table.insert(extra_args, "-i")
                        table.insert(extra_args, params.options.tabSize)
                    end

                    return extra_args
                end,
            }),
            -- svg
            sources_formatting.svgo,
            -- toml/yaml
            require("none-ls.formatting.yq"),
            -- web
            b.diagnostics.stylelint.with({
                extra_args = {
                    "--config",
                    vim.fn.expand("$HOME/.config/code/.stylelintrc.json"),
                },
            }),
            require("none-ls.formatting.eslint_d"),
            b.formatting.stylelint.with({
                extra_args = {
                    "--config",
                    vim.fn.expand("$HOME/.config/code/.stylelintrc.json"),
                },
            }),
            b.formatting.prettier.with({
                filetypes = {
                    "yaml",
                    "markdown",
                    "markdown.mdx",
                    "graphql",
                    "handlebars",
                    "svelte",
                    "vimwiki",
                    -- prettierd
                    "javascript",
                    "javascriptreact",
                    "typescript",
                    "typescriptreact",
                    "vue",
                    "css",
                    "scss",
                    "less",
                    "html",
                    "json",
                    "jsonc",
                },
                extra_args = function(params)
                    local extra_args = {}

                    if params.options and not params.options.insertSpaces then
                        table.insert(extra_args, "--use-tabs")
                        table.insert(extra_args, "true")
                    end

                    if params.options and params.options.tabSize then
                        table.insert(extra_args, "--tab-width")
                        table.insert(extra_args, params.options.tabSize)
                    end

                    return extra_args
                end,
            }),
            -- b.formatting.prettierd.with({
            --     filetypes = {
            --         "javascript",
            --         "javascriptreact",
            --         "typescript",
            --         "typescriptreact",
            --         "vue",
            --         "css",
            --         "scss",
            --         "less",
            --         "html",
            --         "json",
            --         "jsonc",
            --     },
            -- }),
            -- markdown/vimwiki
            b.diagnostics.markdownlint.with({
                filetypes = { "markdown", "vimwiki" },
                extra_args = {
                    "--config",
                    vim.fn.expand("$HOME/.config/code/.markdownlint.jsonc"),
                    "--stdin",
                },
            }),
            b.diagnostics.vale.with({
                filetypes = { "markdown", "tex", "vimwiki" },
                extra_args = {
                    "--config",
                    vim.fn.expand("$HOME/.config/vale/.vale.ini"),
                },
            }),
        },
    }, overrides or {})

    null_ls.setup(config)

    null_ls.register(require("none-ls-shellcheck.diagnostics"))
    null_ls.register(require("none-ls-shellcheck.code_actions"))

    null_ls.register({
        name = "slow_formatters",
        sources = {
            -- python
            sources_formatting.pybetter,
        },
    })
    null_ls.disable({ name = "slow_formatters" })
end

return M

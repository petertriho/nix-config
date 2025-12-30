return {
    "mfussenegger/nvim-lint",
    lazy = true,
    init = function()
        local utils = require("peter.core.utils")

        local function run_linters(filter)
            return function(bufnr)
                local filetype = vim.bo[bufnr].filetype

                if utils.is_ft("excludes", filetype) then
                    return
                end

                local lint = require("lint")
                -- https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/plugins/linting.lua
                local linters = lint._resolve_linter_by_ft(filetype)

                linters = vim.list_extend({}, linters)

                if #linters == 0 then
                    vim.list_extend(linters, lint.linters_by_ft["_"] or {})
                end
                vim.list_extend(linters, lint.linters_by_ft["*"] or {})

                if #linters == 0 then
                    return
                end

                local ctx = { filename = vim.api.nvim_buf_get_name(bufnr) }
                ctx.dirname = vim.fn.fnamemodify(ctx.filename, ":h")
                linters = vim.tbl_filter(function(name)
                    local linter = lint.linters[name]
                    if not linter then
                        vim.notify(string.format("ERROR: Linter %s not found", name), vim.log.levels.ERROR)
                    end
                    return filter(ctx, linter)
                end, linters)

                if #linters > 0 then
                    lint.try_lint(linters)
                end
            end
        end

        local augroup = vim.api.nvim_create_augroup("Lint", {})

        vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "TextChanged", "InsertLeave" }, {
            group = augroup,
            callback = utils.debounce(
                run_linters(function(ctx, linter)
                    return linter
                        and not (type(linter) == "table" and linter.condition and not linter.condition(ctx))
                        and not linter.defer
                end),
                utils.new_timer(),
                300
            ),
            desc = "Run linters",
        })

        vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, {
            group = augroup,
            callback = utils.debounce(
                run_linters(function(ctx, linter)
                    return linter
                        and not (type(linter) == "table" and linter.condition and not linter.condition(ctx))
                        and linter.defer
                end),
                utils.new_timer(),
                1000
            ),
            desc = "Run deferred linters (on read/write only)",
        })
    end,
    config = function()
        local lint = require("lint")

        -- Custom
        lint.linters.jq = {
            cmd = "jq",
            stdin = true,
            args = { "." },
            stream = "both",
            ignore_exitcode = true,
            parser = require("lint.parser").from_pattern(
                [[parse (%w+):(%w+) at line (%d+), column (%d+)]],
                { "severity", "message", "lnum", "col" },
                {
                    error = vim.diagnostic.severity.ERROR,
                },
                { source = "jq" },
                {}
            ),
        }
        lint.linters.refurb = {
            cmd = "refurb",
            stdin = true,
            args = {
                "--disable",
                -- FURB109: Replace [] with ()
                "FURB109",
            },
            stream = "both",
            ignore_exitcode = true,
            parser = require("lint.parser").from_pattern([[:(%d+):(%d+) (.+)]], { "lnum", "col", "message" }, {
                error = vim.diagnostic.severity.ERROR,
            }, { source = "refurb" }, {}),
            defer = true,
        }

        -- Overrides
        lint.linters.codespell.defer = true
        lint.linters.bandit.args = {
            "--skip",
            -- B101: assert_used
            "B101",
            "-f",
            "custom",
            "--msg-template",
            "{line}:{col}:{severity}:{test_id} {msg}",
        }
        lint.linters.bandit.defer = true
        lint.linters.dmypy.args = {
            "run",
            "--timeout",
            "50000",
            "--",
            "--show-column-numbers",
            "--show-error-end",
            "--hide-error-context",
            "--no-color-output",
            "--no-error-summary",
            "--no-pretty",
            "--follow-untyped-imports",
            "--python-executable",
            function()
                return vim.fn.exepath("python3") or vim.fn.exepath("python")
            end,
        }
        lint.linters.dmypy.defer = true
        lint.linters.markdownlint.args = {
            "--config",
            vim.fn.expand("$HOME/.config/nvim/code/.markdownlint.jsonc"),
            "--stdin",
        }
        lint.linters.pylint.args = {
            "-f",
            "json",
            "--from-stdin",
            "--init-hook=import pylint_venv; pylint_venv.inithook(quiet=True)",
            function()
                return vim.api.nvim_buf_get_name(0)
            end,
        }
        lint.linters.selene.condition = function(ctx)
            return vim.fs.find({ "selene.toml" }, { path = ctx.filename, upward = true })[1]
        end
        lint.linters.luacheck.args = {
            "--globals",
            "vim",
            "--formatter",
            "plain",
            "--codes",
            "--ranges",
            "-",
        }
        lint.linters.stylelint.args = {
            "--config",
            vim.fn.expand("$HOME/.config/nvim/code/.stylelintrc.json"),
        }
        lint.linters.sqlfluff.args = {
            "lint",
            "--format=json",
            "--dialect=postgres",
        }

        lint.linters_by_ft = {
            -- ["*"] = { "codespell" },
            conf = { "dotenv_linter" },
            css = { "stylelint" },
            dockerfile = { "hadolint" },
            elixir = { "credo" },
            lua = { "luacheck", "selene" },
            markdown = { "markdownlint" },
            nix = { "statix" },
            -- python = { "pylint", "dmypy", "vulture" },
            -- sh = { "shellcheck" },
            sql = { "sqlfluff" },
            xml = { "tidy" },
            yaml = { "yamllint" },
        }

        local filetypes_to_linters = {
            {
                { "html", "htmlangular", "htmldjango" },
                { "tidy", "djlint" },
            },
            -- {
            --     {
            --         "javascript",
            --         "javascriptreact",
            --         "javascript.jsx",
            --         "typescript",
            --         "typescriptreact",
            --         "typescript.tsx",
            --     },
            --     { vim.g.has_deno and "deno" or "eslint_d" },
            -- },
            {
                { "json", "jsonc" },
                { "jq" },
            },
        }

        for _, config in ipairs(filetypes_to_linters) do
            local ft = config[1]
            local linters = config[2]

            for _, f in ipairs(ft) do
                lint.linters_by_ft[f] = lint.linters_by_ft[f] or {}
                vim.list_extend(lint.linters_by_ft[f], linters)
            end
        end
    end,
}

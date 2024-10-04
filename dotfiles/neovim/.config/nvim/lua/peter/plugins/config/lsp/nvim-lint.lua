return {
    "mfussenegger/nvim-lint",
    lazy = true,
    init = function()
        local utils = require("peter.core.utils")

        local function run_linters(filter)
            return function(bufnr)
                if utils.file_is_big(bufnr) then
                    return
                end

                local lint = require("lint")
                -- https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/plugins/linting.lua
                local linters = lint._resolve_linter_by_ft(vim.bo.filetype)

                linters = vim.list_extend({}, linters)

                if #linters == 0 then
                    vim.list_extend(linters, lint.linters_by_ft["_"] or {})
                end
                vim.list_extend(linters, lint.linters_by_ft["*"] or {})

                local ctx = { filename = vim.api.nvim_buf_get_name(bufnr) }
                ctx.dirname = vim.fn.fnamemodify(ctx.filename, ":h")
                linters = vim.tbl_filter(function(name)
                    local linter = lint.linters[name]
                    if not linter then
                        print(string.format("ERROR: Linter %s not found", name))
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
        lint.linters.markdownlint.args = {
            "--config",
            vim.fn.expand("$HOME/.config/nvim/code/.markdownlint.jsonc"),
            "--stdin",
        }
        lint.linters.selene.condition = function(ctx)
            return vim.fs.find({ "selene.toml" }, { path = ctx.filename, upward = true })[1]
        end
        lint.linters.stylelint.args = {
            "--config",
            vim.fn.expand("$HOME/.config/nvim/code/.stylelintrc.json"),
        }
        lint.linters.vale.args = {
            "--config",
            vim.fn.expand("$HOME/.config/vale/.vale.ini"),
            "--no-exit",
            "--output",
            "JSON",
            "--ext",
            function(bufnr)
                bufnr = bufnr or 0
                return "." .. vim.fn.fnamemodify(vim.api.nvim_buf_get_name(bufnr), ":e")
            end,
        }

        lint.linters_by_ft = {
            ["*"] = { "codespell" },
            conf = { "dotenv_linter" },
            css = { "stylelint" },
            dockerfile = { "hadolint" },
            html = { "tidy" },
            htmlangular = { "tidy" },
            htmldjango = { "tidy" },
            json = { "jq" },
            jsonc = { "jq" },
            lua = { "luacheck", "selene" },
            markdown = { "markdownlint", "vale" },
            nix = { "statix" },
            python = { "bandit", "refurb" },
            sh = { "shellcheck" },
            xml = { "tidy" },
            yaml = { "yamllint" },
        }
    end,
}

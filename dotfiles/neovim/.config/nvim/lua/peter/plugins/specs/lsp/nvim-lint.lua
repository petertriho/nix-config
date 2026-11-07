return {
    "mfussenegger/nvim-lint",
    lazy = true,
    init = function()
        local utils = require("peter.core.utils")

        local function should_run(ctx, linter, deferred)
            if type(linter) == "function" then
                linter = linter()
            end
            if type(linter) ~= "table" then
                return false
            end
            if linter.condition and not linter.condition(ctx) then
                return false
            end
            -- Linters without stdin read the file on disk. Their results match
            -- the buffer only after a read or write, so they run as deferred.
            local is_deferred = linter.defer == true or not linter.stdin
            return is_deferred == deferred
        end

        local function run_linters(deferred)
            return function(bufnr)
                if utils.is_excludes_buf(bufnr) then
                    return
                end

                local filetype = vim.bo[bufnr].filetype
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
                        vim.notify_once(string.format("ERROR: Linter %s not found", name), vim.log.levels.ERROR)
                        return false
                    end
                    return should_run(ctx, linter, deferred)
                end, linters)

                if #linters > 0 then
                    lint.try_lint(linters)
                end
            end
        end

        local augroup = vim.api.nvim_create_augroup("Lint", {})

        -- Each buffer has its own timer, so an event in one buffer does not
        -- cancel a pending lint in another (for example `:wa` or a session
        -- restore). The timer lints args.buf, not the buffer that is current
        -- when it fires. lint.try_lint lints the current buffer, so it runs
        -- inside nvim_buf_call.
        local function debounced_lint(deferred, ms)
            local run = run_linters(deferred)
            local timers = {}

            vim.api.nvim_create_autocmd("BufWipeout", {
                group = augroup,
                callback = function(args)
                    local timer = timers[args.buf]
                    if timer then
                        timers[args.buf] = nil
                        timer:stop()
                        timer:close()
                    end
                end,
                desc = "Close lint debounce timer",
            })

            return function(args)
                local bufnr = args.buf
                local timer = timers[bufnr]
                if not timer then
                    timer = utils.new_timer()
                    timers[bufnr] = timer
                end
                timer:stop()
                timer:start(
                    ms,
                    0,
                    vim.schedule_wrap(function()
                        if vim.api.nvim_buf_is_valid(bufnr) then
                            vim.api.nvim_buf_call(bufnr, function()
                                run(bufnr)
                            end)
                        end
                    end)
                )
            end
        end

        vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "TextChanged", "InsertLeave" }, {
            group = augroup,
            callback = debounced_lint(false, 300),
            desc = "Run linters",
        })

        vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, {
            group = augroup,
            callback = debounced_lint(true, 1000),
            desc = "Run deferred and file-based linters (on read/write only)",
        })
    end,
    config = function()
        local lint = require("lint")

        -- Custom
        lint.linters.jq = {
            cmd = "jq",
            stdin = true,
            -- `empty` validates without echoing the document to stdout.
            args = { "empty" },
            stream = "stderr",
            ignore_exitcode = true,
            parser = require("lint.parser").from_pattern(
                [[parse (%w+): (.+) at line (%d+), column (%d+)]],
                { "severity", "message", "lnum", "col" },
                {
                    error = vim.diagnostic.severity.ERROR,
                },
                { source = "jq" },
                {}
            ),
        }
        lint.linters.xmllint = {
            cmd = "xmllint",
            stdin = true,
            args = { "--noout", "-" },
            stream = "stderr",
            ignore_exitcode = true,
            -- -:2: parser error : Opening and ending tag mismatch: b line 2 and c
            parser = require("lint.parser").from_pattern(
                [[^%-:(%d+): %a+ (%a+) : (.+)$]],
                { "lnum", "severity", "message" },
                {
                    error = vim.diagnostic.severity.ERROR,
                    warning = vim.diagnostic.severity.WARN,
                },
                { source = "xmllint" }
            ),
        }

        -- Overrides
        local function is_github_workflow(ctx)
            return ctx.filename:find("/%.github/workflows/[^/]+%.ya?ml$") ~= nil
        end
        lint.linters.actionlint.condition = is_github_workflow
        lint.linters.zizmor.condition = is_github_workflow
        -- rumdl writes its JSON report to stdout. The upstream definition reads stderr.
        lint.linters.rumdl.stream = "stdout"
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
        -- Keep the upstream args: the parser needs `-f json` and the buffer
        -- content goes in with `--stdin`.
        lint.linters.stylelint.args = vim.list_extend({
            "--config",
            vim.fn.expand("$HOME/.config/nvim/code/.stylelintrc.json"),
        }, lint.linters.stylelint.args)
        lint.linters.sqlfluff.args = {
            "lint",
            "--format=json",
            "--dialect=postgres",
            "-",
        }

        lint.linters_by_ft = {
            bash = { "shellcheck" },
            css = { "stylelint" },
            dockerfile = { "hadolint" },
            elixir = { "credo" },
            env = { "dotenv_linter" },
            go = { "golangcilint" },
            -- htmlhint reports template syntax (`*ngIf`, `{% %}`) as errors,
            -- so templates use only djlint.
            html = { "htmlhint", "djlint" },
            htmlangular = { "djlint" },
            htmldjango = { "djlint" },
            -- jq rejects comments, so jsonc is not linted.
            json = { "jq" },
            lua = { "luacheck", "selene" },
            markdown = { "rumdl" },
            nix = { "statix", "deadnix" },
            -- python = { "vulture" },
            sh = { "shellcheck" },
            -- sql = { "sqlfluff" },
            xml = { "xmllint" },
            yaml = { "yamllint", "actionlint", "zizmor" },
        }

        local filetypes_to_linters = {
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

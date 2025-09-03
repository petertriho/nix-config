local disabled_lsp_formatters = {
    ["typescript-tools"] = true,
    basedpyright = true,
    pyright = true,
    ruff = true,
    ts_ls = true,
    vtsls = true,
}

local get_format_opts = function(opts)
    opts = opts or {}

    opts.async = true
    opts.filter = function(client)
        return not disabled_lsp_formatters[client.name]
    end

    return opts
end

local get_range = function(args)
    local range = nil
    if args.count ~= -1 then
        local end_line = vim.api.nvim_buf_get_lines(0, args.line2 - 1, args.line2, true)[1]
        range = {
            start = { args.line1, 0 },
            ["end"] = { args.line2, end_line:len() },
        }
    end
    return range
end

local format = function(opts)
    local bufnr = vim.api.nvim_get_current_buf()
    local conform_progress = require("conform-progress")
    local token = conform_progress.start(bufnr)

    if not token then
        return
    end

    local format_opts = get_format_opts(opts)
    require("conform").format(format_opts, function(err)
        conform_progress.finish(bufnr, token, err)
    end)
end

return {
    "stevearc/conform.nvim",
    cmd = { "ConformInfo" },
    keys = {
        { "<leader>f", "<CMD>Format<CR>", mode = { "n", "v" }, desc = "Format" },
        { "<leader>F", "<CMD>SlowFormat<CR>", mode = { "n", "v" }, desc = "Slow Format" },
        { "<leader>gf", "<CMD>DiffFormat<CR>", mode = { "n", "v" }, desc = "Diff Format" },
    },
    dependencies = {
        {
            dir = "~/.config/nvim/plugins/conform-progress",
        },
    },
    init = function()
        vim.api.nvim_create_user_command("Format", function(args)
            format({
                range = get_range(args),
            })
        end, { range = true })

        vim.api.nvim_create_user_command("SlowFormat", function(args)
            format({
                formatters = {
                    python = { "pybetter" },
                },
                range = get_range(args),
            })
        end, { range = true })

        vim.api.nvim_create_user_command("DiffFormat", function()
            local bufnr = vim.api.nvim_get_current_buf()
            local conform_progress = require("conform-progress")
            local token = conform_progress.start(bufnr)

            if not token then
                return
            end

            local hunks = require("gitsigns").get_hunks()

            if hunks == nil then
                conform_progress.finish(bufnr, token, nil)
                return
            end

            local function format_range()
                if next(hunks) == nil then
                    conform_progress.finish(bufnr, token, nil)
                    return
                end
                local hunk = nil
                while next(hunks) ~= nil and (hunk == nil or hunk.type == "delete") do
                    hunk = table.remove(hunks)
                end

                if hunk ~= nil and hunk.type ~= "delete" then
                    local start = hunk.added.start
                    local last = start + hunk.added.count
                    local last_hunk_line = vim.api.nvim_buf_get_lines(0, last - 2, last - 1, true)[1]
                    local range = { start = { start, 0 }, ["end"] = { last - 1, last_hunk_line:len() } }

                    local format_opts = get_format_opts({ range = range })
                    require("conform").format(format_opts, function(err)
                        if err then
                            conform_progress.finish(bufnr, token, err)
                            return
                        end

                        vim.defer_fn(function()
                            format_range()
                        end, 1)
                    end)
                else
                    conform_progress.finish(bufnr, token)
                end
            end

            format_range()
        end, {})
    end,
    config = function()
        require("conform-progress").setup()

        local conform = require("conform")

        local function first(bufnr, ...)
            for i = 1, select("#", ...) do
                local formatter = select(i, ...)
                if conform.get_formatter_info(formatter, bufnr).available then
                    return formatter
                end
            end
            return select(1, ...)
        end

        local with_prettier_formatter = function(before, after)
            return function(bufnr)
                local formatters = before or {}
                table.insert(formatters, first(bufnr, "prettierd", "prettier"))
                vim.list_extend(formatters, after or {})
                return formatters
            end
        end

        local prettier = { "prettierd", "prettier", stop_after_first = true }
        -- local javascript_formatters = with_prettier_formatter({ "eslint_d" })
        local javascript_formatters = vim.tbl_extend("force", prettier, { lsp_format = "first" })

        local formatters_by_ft = {
            css = with_prettier_formatter({ "stylelint" }),
            fish = { "fish_indent" },
            gitcommit = { "commitmsgfmt" },
            go = { "goimports", "gofmt" },
            hurl = { "hurlfmt" },
            java = { "google_java_format", lsp_format = "prefer" },
            json = with_prettier_formatter({ "jq", "sort_package_json" }),
            lua = { "stylua" },
            make = { "mbake" },
            markdown = with_prettier_formatter({}, { "injected" }),
            nix = { "alejandra", "nixfmt", "injected" },
            python = function(bufnr)
                local formatters = { "autoflake", "docformatter", "ssort", "reorder-python-imports" }
                if conform.get_formatter_info("ruff_format", bufnr).available then
                    vim.list_extend(formatters, { "ruff_fix", "ruff_organize_imports", "ruff_format" })
                else
                    vim.list_extend(formatters, { "isort", "black" })
                end
                return formatters
            end,
            sh = { "shfmt" },
            sql = {
                "sqlfluff",
                -- "sql_formatter",
                -- "plsql_formatter",
                "postgresql_formatter",
            },
            svg = { "svgo" },
            typst = { "typstyle" },
            xml = { "tidy" },
            yaml = with_prettier_formatter({ "yamlfix", "yq", "yamlfmt" }),
        }

        local filetypes_to_formatters = {
            {
                {
                    "html",
                    "htmlangular",
                    "htmldjango",
                },
                with_prettier_formatter({ "tidy", "djlint" }),
            },
            {
                {
                    "javascript",
                    "javascriptreact",
                    "typescript",
                    "typescriptreact",
                },
                javascript_formatters,
            },
            {
                {
                    "hcl",
                    "terraform",
                    "tf",
                },
                { "hcl" },
            },
            {
                { "graphql", "jsonc" },
                prettier,
            },
        }

        for _, config in ipairs(filetypes_to_formatters) do
            local ft = config[1]
            local formatters = config[2]

            for _, f in ipairs(ft) do
                formatters_by_ft[f] = formatters
            end
        end

        conform.setup({
            formatters_by_ft = formatters_by_ft,
            default_format_opts = get_format_opts({
                lsp_format = "fallback",
            }),
            formatters = {
                docformatter = {
                    prepend_args = {
                        "--black",
                        "--pre-summary-newline",
                    },
                },
                -- eslint_d = {
                --     condition = function(ctx)
                --         -- TODO: parse package.json to check if eslint config/package exists
                --         return vim.fs.find(function(name, path)
                --             return name:match(".*eslint*")
                --         end, { path = ctx.filename, upward = true })[1]
                --     end,
                -- },
                google_java_format = {
                    command = "google-java-format",
                    args = { "-" },
                    range_args = function(self, ctx)
                        return {
                            "--lines",
                            ctx.range.start[1] .. ":" .. ctx.range["end"][1],
                            "--skip-sorting-imports",
                            "--skip-removing-unused-imports",
                            "--skip-javadoc-formatting",
                            "--skip-reflowing-long-strings",
                            "-",
                        }
                    end,
                },
                isort = {
                    prepend_args = { "--profile", "black" },
                },
                jq = {
                    command = "jq",
                },
                mbake = {
                    command = "mbake",
                    args = { "format", "$FILENAME" },
                    stdin = false,
                },
                plsql_formatter = {
                    command = "sql-formatter",
                    args = { "--language", "plsql" },
                    -- exit_codes = { 0, 1 },
                },
                postgresql_formatter = {
                    command = "sql-formatter",
                    args = { "--language", "postgresql" },
                    -- exit_codes = { 0, 1 },
                },
                pybetter = {
                    command = "pybetter",
                    args = {
                        "--exclude",
                        -- B002: Default values for kwargs are mutable.
                        -- B004: __all__ attribute is missing.
                        "B002,B004",
                        "$FILENAME",
                    },
                    stdin = false,
                },
                shfmt = {
                    args = function(_, ctx)
                        local args = {
                            "--filename",
                            "$FILENAME",
                            "--simplify",
                            "--binary-next-line",
                            "--case-indent",
                            "--space-redirects",
                        }
                        if vim.bo[ctx.buf].expandtab then
                            vim.list_extend(args, { "--indent", ctx.shiftwidth })
                        end
                        return args
                    end,
                },
                sort_package_json = {
                    command = "sort-package-json",
                    args = { "$FILENAME" },
                    stdin = false,
                    condition = function(self, ctx)
                        return vim.fs.basename(ctx.filename):lower():match("package.json$") ~= nil
                    end,
                },
                sql_formatter = {
                    command = "sql-formatter",
                    -- exit_codes = { 0, 1 },
                },
                ssort = {
                    command = "ssort",
                    args = { "$FILENAME" },
                    stdin = false,
                },
                stylelint = {
                    prepend_args = {
                        "--config",
                        vim.fn.expand("$HOME/.config/nvim/code/.stylelintrc.json"),
                    },
                },
                stylua = {
                    prepend_args = function(self, ctx)
                        local extra_args = {}
                        if not require("conform.util").root_file({ "stylua.toml", ".stylua.toml" })(self, ctx) then
                            extra_args = {
                                "--config-path",
                                vim.fn.expand("$HOME/.config/nvim/code/.stylua.toml"),
                            }
                        end
                        return extra_args
                    end,
                },
                svgo = {
                    command = "svgo",
                    args = {
                        "--pretty",
                        "-i",
                        "$FILENAME",
                        "-o",
                        "-",
                    },
                },
                tidy = {
                    command = "tidy",
                    args = {
                        "--tidy-mark",
                        "no",
                        "-quiet",
                        "-indent",
                        "-wrap",
                        "-",
                    },
                },
            },
        })
    end,
}

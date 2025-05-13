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

local format_msg = function(msg)
    if type(msg) == "table" then
        msg = vim.inspect(msg)
    end
    return msg:gsub("(" .. string.rep(".", 80) .. ")", "%1\n")
end

local get_format_msg_handle = function()
    local conform = require("conform")
    local formatters, will_use_lsp = conform.list_formatters_to_run()

    local fmt_names = {}
    if not vim.tbl_isempty(formatters) then
        fmt_names = vim.tbl_map(function(f)
            return f.name .. " ❬"
        end, formatters)
    elseif will_use_lsp then
        fmt_names = { "lsp ❬" }
    else
        require("fidget").notify(format_msg("No lsp/formatters configured"), vim.log.levels.WARN)
        return
    end

    local msg_handle = require("fidget.progress").handle.create({
        title = "fmt",
        message = "In progress...\n" .. table.concat(fmt_names, "\n"),
        lsp_client = { name = "conform" },
        percentage = nil,
    })

    return msg_handle
end

local format = function(opts)
    local msg_handle = get_format_msg_handle()

    if not msg_handle then
        return
    end

    local format_opts = get_format_opts(opts)
    require("conform").format(format_opts, function(err)
        msg_handle.message = "Completed"
        msg_handle:finish()
        if err then
            require("fidget").notify(format_msg(err), vim.log.levels.ERROR)
        end
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
            local msg_handle = get_format_msg_handle()

            if not msg_handle then
                return
            end

            local hunks = require("gitsigns").get_hunks()

            if hunks == nil then
                msg_handle.message = "Completed"
                msg_handle:finish()
                return
            end

            local function format_range()
                if next(hunks) == nil then
                    msg_handle.message = "Completed"
                    msg_handle:finish()
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
                            msg_handle.message = "Completed"
                            msg_handle:finish()
                            require("fidget").notify(format_msg(err), vim.log.levels.ERROR)
                        end

                        vim.defer_fn(function()
                            format_range()
                        end, 1)
                    end)
                end
            end

            format_range()
        end, {})
    end,
    config = function()
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
            java = { "google_java_format", lsp_format = "prefer" },
            json = with_prettier_formatter({ "jq", "sort_package_json" }),
            lua = { "stylua" },
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
                "sql_formatter",
            },
            svg = { "svgo" },
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

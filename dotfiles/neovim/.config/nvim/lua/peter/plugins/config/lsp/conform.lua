local disabled_lsp_formatters = {
    ["typescript-tools"] = true,
    basedpyright = true,
    pyright = true,
    ruff = true,
    ts_ls = true,
    vtsls = true,
}

-- Progress tracking for formatting operations
local format_progress = {}
local format_token_counter = 0

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

local create_format_progress = function()
    local conform = require("conform")
    local formatters, will_use_lsp = conform.list_formatters_to_run()

    local formatter_names = {}
    if not vim.tbl_isempty(formatters) then
        formatter_names = vim.tbl_map(function(f)
            return f.name
        end, formatters)
    elseif will_use_lsp then
        formatter_names = { "lsp" }
    else
        vim.notify(format_msg("No lsp/formatters configured"), vim.log.levels.WARN)
        return nil
    end

    format_token_counter = format_token_counter + 1
    local token = "format_" .. format_token_counter

    local title = "Formatting"
    local msg = table.concat(formatter_names, "\n")

    -- Add to progress tracking
    format_progress[token] = {
        token = token,
        title = title,
        msg = msg,
        done = false,
    }

    -- Show initial progress notification
    local spinner = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }
    vim.notify(msg, "info", {
        id = "format_progress",
        title = title,
        opts = function(notif)
            notif.icon = spinner[math.floor(vim.uv.hrtime() / (1e6 * 80)) % #spinner + 1]
        end,
    })

    return token
end

local finish_format_progress = function(token, err)
    if not token or not format_progress[token] then
        return
    end

    local progress_item = format_progress[token]
    progress_item.done = true

    progress_item.title = "Formatted"
    local notif_level = "info"
    local notif_icon = ""

    if err then
        progress_item.title = "Failed"
        notif_level = "error"
        notif_icon = ""
    end

    vim.notify(progress_item.msg, notif_level, {
        id = "format_progress",
        title = progress_item.title,
        opts = function(notif)
            notif.icon = notif_icon
        end,
    })

    -- Clean up completed progress
    format_progress[token] = nil
end

local format = function(opts)
    local token = create_format_progress()

    if not token then
        return
    end

    local format_opts = get_format_opts(opts)
    require("conform").format(format_opts, function(err)
        if err then
            finish_format_progress(token, format_msg(err))
        else
            finish_format_progress(token, nil)
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
            local token = create_format_progress()

            if not token then
                return
            end

            local hunks = require("gitsigns").get_hunks()

            if hunks == nil then
                finish_format_progress(token, nil)
                return
            end

            local function format_range()
                if next(hunks) == nil then
                    finish_format_progress(token, nil)
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
                            finish_format_progress(token, format_msg(err))
                            return
                        end

                        vim.defer_fn(function()
                            format_range()
                        end, 1)
                    end)
                else
                    finish_format_progress(token, nil)
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
            make = { "bake" },
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
                bake = {
                    command = "bake",
                    args = { "format", "$FILENAME" },
                    stdin = false,
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

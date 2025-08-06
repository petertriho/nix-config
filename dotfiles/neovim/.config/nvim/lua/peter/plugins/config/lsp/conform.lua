local disabled_lsp_formatters = {
    ["typescript-tools"] = true,
    basedpyright = true,
    pyright = true,
    ruff = true,
    ts_ls = true,
    vtsls = true,
}

-- Buffer-local variable names for progress tracking
local FORMAT_PROGRESS_VAR = "conform_format_progress"

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

-- Generate formatted message for formatter progress display
local generate_formatter_message = function(formatter_names, completed_formatters, current_formatter, failed_formatter)
    local msg_lines = {}
    local current_line = {}

    for i = 1, #formatter_names do
        local name = formatter_names[i]
        local prefix

        if failed_formatter and name == failed_formatter then
            -- Mark only the failed formatter with ✗
            prefix = "✗ "
        elseif completed_formatters[name] then
            -- Show checkmark for completed formatters
            prefix = "[✓] "
        elseif name == current_formatter then
            -- Mark current formatter with arrow
            prefix = "→ "
        else
            -- Show dot for pending formatters
            prefix = "• "
        end

        table.insert(current_line, prefix .. name)

        -- Group into lines of 3
        if #current_line == 3 or i == #formatter_names then
            table.insert(msg_lines, table.concat(current_line, " "))
            current_line = {}
        end
    end

    return table.concat(msg_lines, "\n")
end

local update_formatter_progress = function(bufnr, token, current_formatter)
    local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]
    if not token or not progress_item or progress_item.token ~= token then
        return
    end

    local formatter_names = progress_item.formatter_names
    local completed_formatters = progress_item.completed_formatters

    -- Mark previous formatter as completed if we're moving to a new one
    local current_index = nil
    for i, name in ipairs(formatter_names) do
        if name == current_formatter then
            current_index = i
            break
        end
    end

    if current_index and current_index > 1 then
        local prev_formatter = formatter_names[current_index - 1]
        if not completed_formatters[prev_formatter] then
            completed_formatters[prev_formatter] = true
        end
    end

    local msg = generate_formatter_message(formatter_names, completed_formatters, current_formatter, nil)

    -- Update notification
    vim.notify(msg, vim.log.levels.INFO, {
        id = token,
        title = progress_item.title,
        replace = true,
        opts = function(notif)
            notif.icon = require("peter.core.utils").spinner:get_frame()
        end,
    })
end

local create_format_progress = function(bufnr)
    bufnr = bufnr or vim.api.nvim_get_current_buf()
    local conform = require("conform")
    local formatters, will_use_lsp = conform.list_formatters_to_run(bufnr)

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

    local token = require("peter.core.utils").generate_uuid()

    local title = "Formatting"

    local msg = generate_formatter_message(formatter_names, {}, nil, nil)

    -- Store progress in buffer-local variable
    vim.b[bufnr][FORMAT_PROGRESS_VAR] = {
        token = token,
        title = title,
        msg = msg,
        formatter_names = formatter_names,
        current_formatter_index = 1,
        completed_formatters = {},
        done = false,
    }

    -- Show initial progress notification
    require("peter.core.utils").create_progress_notification({
        id = token,
        title = title,
        message = msg,
    })

    -- Start highlighting the first formatter
    if #formatter_names > 0 then
        update_formatter_progress(bufnr, token, formatter_names[1])
    end

    return token
end

local finish_format_progress = function(bufnr, token, err, failed_formatter)
    local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]
    if not token or not progress_item or progress_item.token ~= token then
        return
    end

    progress_item.done = true

    progress_item.title = err and "Failed" or "Formatted"
    local notif_level = err and vim.log.levels.ERROR or vim.log.levels.INFO

    -- If formatting succeeded, mark all formatters as completed
    if not err then
        for _, name in ipairs(progress_item.formatter_names) do
            progress_item.completed_formatters[name] = true
        end
    end

    local msg = generate_formatter_message(
        progress_item.formatter_names,
        progress_item.completed_formatters,
        nil,
        failed_formatter
    )

    require("peter.core.utils").finish_progress_notification({
        id = token,
        title = progress_item.title,
        message = msg,
        level = notif_level,
    })

    -- Clean up completed progress
    vim.b[bufnr][FORMAT_PROGRESS_VAR] = nil
end

-- Set up autocmd to track formatter progress using conform's built-in events
local setup_formatter_progress_tracking = function()
    local augroup = vim.api.nvim_create_augroup("ConformProgressTracking", { clear = true })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPre",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]

            -- Update progress to show current formatter
            if progress_item and not progress_item.done and args.data and args.data.formatter then
                update_formatter_progress(bufnr, progress_item.token, args.data.formatter.name)
            end
        end,
    })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPost",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]

            -- Check if this formatter failed and store the failure
            if progress_item and not progress_item.done and args.data then
                if args.data.err then
                    -- Store the failed formatter name
                    if args.data.formatter then
                        progress_item.failed_formatter = args.data.formatter.name
                    end
                end
            end
        end,
    })
end

local format = function(opts)
    local bufnr = vim.api.nvim_get_current_buf()
    local token = create_format_progress(bufnr)

    if not token then
        return
    end

    local format_opts = get_format_opts(opts)
    require("conform").format(format_opts, function(err)
        local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]
        local failed_formatter = progress_item and progress_item.failed_formatter

        if err then
            finish_format_progress(bufnr, token, format_msg(err), failed_formatter)
        else
            finish_format_progress(bufnr, token, nil, nil)
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
            local bufnr = vim.api.nvim_get_current_buf()
            local token = create_format_progress(bufnr)

            if not token then
                return
            end

            local hunks = require("gitsigns").get_hunks()

            if hunks == nil then
                finish_format_progress(bufnr, token, nil, nil)
                return
            end

            local function format_range()
                if next(hunks) == nil then
                    finish_format_progress(bufnr, token, nil, nil)
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
                            local progress_item = vim.b[bufnr][FORMAT_PROGRESS_VAR]
                            local failed_formatter = progress_item and progress_item.failed_formatter
                            finish_format_progress(bufnr, token, format_msg(err), failed_formatter)
                            return
                        end

                        vim.defer_fn(function()
                            format_range()
                        end, 1)
                    end)
                else
                    finish_format_progress(bufnr, token, nil, nil)
                end
            end

            format_range()
        end, {})
    end,
    config = function()
        -- Set up progress tracking using conform's autocmd events
        setup_formatter_progress_tracking()

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

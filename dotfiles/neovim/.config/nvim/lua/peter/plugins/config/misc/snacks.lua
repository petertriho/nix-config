local filter = function(buf)
    if vim.g.snacks_indent == false or vim.b[buf].snacks_indent == false then
        return false
    end

    if vim.bo[buf].buftype ~= "" then
        return false
    end

    local filetype = vim.bo[buf].filetype
    return not require("peter.core.utils").is_ft("excludes", filetype)
end

local get_scratch_path = function()
    local scratch_path = vim.env.SCRATCH_PATH

    if scratch_path then
        return vim.fn.expand(scratch_path)
    else
        return vim.fn.stdpath("data") .. "/scratch"
    end
end

return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    -- event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        local snacks = require("snacks")

        local select = function(n)
            return function(picker)
                local idx = picker.list:row2idx(n)
                picker.list:_move(idx, true, true)
                picker:action("confirm")
            end
        end

        local flash = function(picker)
            require("flash").jump({
                pattern = "^",
                label = { after = { 0, 0 } },
                search = {
                    mode = "search",
                    exclude = {
                        function(win)
                            return vim.bo[vim.api.nvim_win_get_buf(win)].filetype ~= "snacks_picker_list"
                        end,
                    },
                    multi_window = true,
                },
                action = function(match)
                    local idx = picker.list:row2idx(match.pos[1])
                    picker.list:_move(idx, true, true)
                end,
            })
        end

        local qflist_append = function(picker)
            picker:close()
            local sel = picker:selected()
            local items = #sel > 0 and sel or picker:items()

            local qf = {} ---@type vim.quickfix.entry[]
            for _, item in ipairs(items) do
                qf[#qf + 1] = {
                    filename = snacks.picker.util.path(item),
                    bufnr = item.buf,
                    lnum = item.pos and item.pos[1] or 1,
                    col = item.pos and item.pos[2] + 1 or 1,
                    end_lnum = item.end_pos and item.end_pos[1] or nil,
                    end_col = item.end_pos and item.end_pos[2] + 1 or nil,
                    text = item.line or item.comment or item.label or item.name or item.detail or item.text,
                    pattern = item.search,
                    type = ({ "E", "W", "I", "N" })[item.severity],
                    valid = true,
                }
            end
            vim.fn.setqflist(qf, "a")
            vim.cmd("botright copen")
        end

        local exclude = vim.opt.wildignore:get()

        snacks.setup({
            dashboard = {
                preset = {
                    keys = {
                        { icon = " ", key = "e", desc = "New File", action = ":ene | startinsert" },
                        {
                            icon = " ",
                            key = "f",
                            desc = "Find File",
                            action = ":lua Snacks.dashboard.pick('files')",
                        },
                        {
                            icon = " ",
                            key = "s",
                            desc = "Find Text",
                            action = ":lua Snacks.dashboard.pick('live_grep')",
                        },
                        {
                            icon = " ",
                            key = "r",
                            desc = "Recent Files",
                            action = ":lua Snacks.dashboard.pick('oldfiles')",
                        },
                        {
                            icon = " ",
                            key = "g",
                            desc = "Lazygit",
                            action = ":lua Snacks.lazygit()",
                        },
                        -- {
                        --     icon = " ",
                        --     key = "c",
                        --     desc = "Config",
                        --     action = ":lua Snacks.dashboard.pick('files', {cwd = vim.fn.stdpath('config')})",
                        -- },
                        {
                            icon = " ",
                            key = "u",
                            desc = "Update dashboard",
                            action = ":lua Snacks.dashboard.update()",
                        },
                        {
                            icon = "󰒲 ",
                            key = "L",
                            desc = "Lazy",
                            action = ":Lazy",
                            enabled = package.loaded.lazy ~= nil,
                        },
                        { icon = " ", key = "q", desc = "Quit", action = ":qa" },
                    },
                },
                sections = {
                    -- left
                    { section = "header" },
                    { section = "keys", gap = 1, padding = 1 },
                    { icon = " ", title = "Recent Files", section = "recent_files", indent = 2, padding = 1 },
                    { section = "startup" },
                    -- right
                    -- {
                    --     pane = 2,
                    --     section = "terminal",
                    --     cmd = "colorscript -e square",
                    --     height = 5,
                    --     padding = 1,
                    --     ttl = 5 * 60,
                    -- },
                    {
                        pane = 2,
                        icon = " ",
                        desc = "Browse Repo",
                        padding = 1,
                        key = "b",
                        action = function()
                            snacks.gitbrowse()
                        end,
                    },
                    function()
                        local in_git = snacks.git.get_root() ~= nil
                        local cmds = {
                            {
                                title = "Notifications",
                                cmd = "gh-notify -s -a -n5",
                                action = function()
                                    vim.ui.open("https://github.com/notifications")
                                end,
                                key = "n",
                                icon = " ",
                                height = 5,
                                enabled = true,
                            },
                            {
                                title = "Open Issues",
                                cmd = "gh issue list -L 3",
                                key = "i",
                                action = function()
                                    vim.fn.jobstart("gh issue list --web", { detach = true })
                                end,
                                icon = " ",
                                height = 7,
                            },
                            {
                                icon = " ",
                                title = "Open PRs",
                                cmd = "gh pr list -L 3",
                                key = "p",
                                action = function()
                                    vim.fn.jobstart("gh pr list --web", { detach = true })
                                end,
                                height = 7,
                            },
                            {
                                icon = " ",
                                title = "Git Status",
                                cmd = "git --no-pager diff --stat -B -M -C",
                                height = 10,
                            },
                        }
                        return vim.tbl_map(function(cmd)
                            return vim.tbl_extend("force", {
                                pane = 2,
                                section = "terminal",
                                enabled = in_git,
                                padding = 1,
                                ttl = 5 * 60,
                                indent = 3,
                            }, cmd)
                        end, cmds)
                    end,
                },
            },
            indent = {
                enabled = true,
                filter = filter,
                scope = {
                    underline = true,
                },
                chunk = {
                    enabled = true,
                },
            },
            input = {
                enabled = true,
                win = {
                    relative = "cursor",
                },
            },
            notifier = {
                enabled = true,
                top_down = false,
                margin = {
                    top = 1,
                    bottom = 1,
                    left = 1,
                    right = 1,
                },
                icons = {
                    error = " ",
                    warn = " ",
                    info = " ",
                    debug = " ",
                    trace = " ",
                },
                style = "compact",
            },
            styles = {
                notification = {
                    wo = { wrap = true, linebreak = true },
                },
            },
            picker = {
                enabled = true,
                ui_select = true,
                layouts = {
                    default = {
                        layout = {
                            box = "horizontal",
                            width = 0.8,
                            min_width = 120,
                            height = 0.8,
                            {
                                box = "vertical",
                                border = "rounded",
                                title = "{source} {live} {flags}",
                                { win = "input", height = 1, border = "bottom" },
                                { win = "list", border = "none" },
                            },
                            { win = "preview", title = "{preview}", border = "rounded", width = 0.6 },
                        },
                    },
                    dropdown = {
                        layout = {
                            backdrop = false,
                            row = 1,
                            width = 0.4,
                            min_width = 80,
                            height = 0.8,
                            border = "none",
                            box = "vertical",
                            { win = "preview", title = "{preview}", height = 0.5, border = true },
                            {
                                box = "vertical",
                                border = true,
                                title = "{title} {live} {flags}",
                                title_pos = "center",
                                { win = "input", height = 1, border = "bottom" },
                                { win = "list", border = "none" },
                            },
                        },
                    },
                },
                sources = {
                    semantic = {
                        finder = function(opts, ctx)
                            local query = ctx.filter.search
                            if not query or query == "" then
                                return function() end
                            end

                            local limit = tostring(opts.limit or 100)
                            local args = { "--sem", "--jsonl", "--limit", limit }

                            -- exclude patterns
                            for _, e in ipairs(opts.exclude or {}) do
                                vim.list_extend(args, { "--exclude", e })
                            end

                            -- no_ignore: skip .gitignore
                            if opts.no_ignore then
                                table.insert(args, "--no-ignore")
                            end

                            -- no_ckignore: skip .ckignore
                            if opts.no_ckignore then
                                table.insert(args, "--no-ckignore")
                            end

                            table.insert(args, query)
                            table.insert(args, vim.uv.cwd() or ".")

                            return require("snacks.picker.source.proc").proc(
                                ctx:opts({
                                    cmd = "ck",
                                    args = args,
                                    ---@param item snacks.picker.finder.Item
                                    transform = function(item)
                                        local ok, data = pcall(vim.json.decode, item.text)
                                        if not ok or not data.path then
                                            return false
                                        end

                                        item.file = data.path
                                        local line = data.span and data.span.line_start or 1
                                        item.pos = { line, 0 }
                                        item.text = tostring(data.snippet or "")
                                        item.score = data.score
                                    end,
                                }),
                                ctx
                            )
                        end,
                        format = "file",
                        preview = "file",
                        live = true,
                        exclude = exclude,
                    },
                    files = {
                        hidden = true,
                        exclude = exclude,
                    },
                    grep = {
                        hidden = true,
                        exclude = exclude,
                    },
                    explorer = {
                        hidden = true,
                        ignored = true,
                        exclude = exclude,
                        layout = {
                            hidden = { "input" },
                        },
                        focus = "list",
                        diagnostics = false,
                        diagnostics_open = false,
                        win = {
                            list = {
                                keys = {
                                    ["O"] = { "explorer_open" },
                                    ["o"] = { { "pick_win", "jump" }, mode = { "n", "i" } },
                                },
                            },
                        },
                    },
                    select = {
                        win = {
                            input = {
                                keys = {
                                    ["1"] = { "select_1", mode = { "n", "i" } },
                                    ["2"] = { "select_2", mode = { "n", "i" } },
                                    ["3"] = { "select_3", mode = { "n", "i" } },
                                    ["4"] = { "select_4", mode = { "n", "i" } },
                                    ["5"] = { "select_5", mode = { "n", "i" } },
                                    ["6"] = { "select_6", mode = { "n", "i" } },
                                    ["7"] = { "select_7", mode = { "n", "i" } },
                                    ["8"] = { "select_8", mode = { "n", "i" } },
                                    ["9"] = { "select_9", mode = { "n", "i" } },
                                    ["0"] = { "select_0", mode = { "n", "i" } },
                                },
                            },
                        },
                    },
                },
                win = {
                    input = {
                        keys = {
                            ["<c-d>"] = { "preview_scroll_down", mode = { "n", "i" } },
                            ["<c-u>"] = { "preview_scroll_up", mode = { "n", "i" } },
                            ["<c-b>"] = { "list_scroll_up", mode = { "n", "i" } },
                            ["<c-f>"] = { "list_scroll_down", mode = { "n", "i" } },
                            ["<c-l>"] = { "toggle_preview", mode = { "n", "i" } },
                            ["<c-s>"] = { "flash", mode = { "n", "i" } },
                            ["s"] = { "flash" },
                            ["<c-t>"] = { "qflist_append", mode = { "n", "i" } },
                        },
                    },
                },
                actions = {
                    flash = flash,
                    select_1 = select(1),
                    select_2 = select(2),
                    select_3 = select(3),
                    select_4 = select(4),
                    select_5 = select(5),
                    select_6 = select(6),
                    select_7 = select(7),
                    select_8 = select(8),
                    select_9 = select(9),
                    select_0 = select(10),
                    qflist_append = qflist_append,
                },
            },
            scope = {
                enabled = true,
                filter = filter,
            },
            scratch = {
                root = get_scratch_path() .. "/scratch",
            },
            words = {
                enabled = true,
            },
        })

        snacks.toggle.option("list"):map("<leader>tl")
        snacks.toggle.option("wrap"):map("<leader>tw")

        vim.api.nvim_create_autocmd("User", {
            pattern = "MiniFilesActionRename",
            callback = function(event)
                snacks.rename.on_rename_file(event.data.from, event.data.to)
            end,
        })
    end,
    keys = {
        {
            "<leader>;",
            function()
                require("snacks").picker.files()
            end,
            desc = "Find Files",
        },
        -- {
        --     "<leader>e",
        --     function()
        --         require("snacks").picker.explorer()
        --     end,
        --     desc = "Explorer",
        -- },
        {
            "<leader>'",
            function()
                require("snacks").picker.grep()
            end,
            desc = "Live Grep",
        },
        {
            "<leader>ln",
            function()
                require("snacks").picker.lsp_symbols()
            end,
            desc = "Dynamic Workspace Symbols",
        },
        {
            "<leader>t'",
            function()
                require("snacks").picker.marks()
            end,
            desc = "Marks",
        },
        {
            "<leader>gb",
            function()
                require("snacks").picker.git_branches()
            end,
            desc = "Branches",
        },
        {
            "<leader>gd",
            function()
                require("snacks").picker.git_diff()
            end,
            desc = "Diff",
        },
        {
            "<leader>gl",
            function()
                require("snacks").picker.git_log()
            end,
            desc = "Logs",
        },
        {
            "<leader>gs",
            function()
                require("snacks").picker.git_stash()
            end,
            desc = "Stash",
        },
        {
            "<leader>ta",
            function()
                require("snacks").picker.files({ hidden = true })
            end,
            desc = "Find Files All",
        },
        {
            "<leader>b",
            function()
                require("snacks").picker.buffers()
            end,
            desc = "Buffers",
        },
        {
            "<leader>t:",
            function()
                require("snacks").picker.commands()
            end,
            desc = "Commands",
        },
        {
            "<leader>th",
            function()
                require("snacks").picker.help()
            end,
            desc = "Help Tags",
        },
        {
            "<leader>tj",
            function()
                require("snacks").picker.jumplist()
            end,
            desc = "Command History",
        },
        {
            "<leader>tm",
            function()
                require("snacks").picker.man()
            end,
            desc = "Man Pages",
        },
        {
            "<leader>nn",
            function()
                require("snacks").notifier.show_history()
            end,
            desc = "Notifications",
        },
        {
            "<leader>to",
            function()
                require("snacks").picker.recent()
            end,
            desc = "Old Files",
        },
        {
            "<leader>ld",
            function()
                require("snacks").picker.lsp_definitions()
            end,
            desc = "Definitions",
        },
        {
            "<leader>le",
            function()
                require("snacks").picker.diagnostics()
            end,
            desc = "Errors",
        },
        {
            "<leader>li",
            function()
                require("snacks").picker.lsp_implementations()
            end,
            desc = "Implementations",
        },
        {
            "<leader>lr",
            function()
                require("snacks").picker.lsp_references()
            end,
            desc = "References",
        },
        {
            "<leader>ls",
            function()
                require("snacks").picker.lsp_symbols({ scope = "document" })
            end,
            desc = "Document Symbols",
        },
        {
            "<leader>lw",
            function()
                require("snacks").picker.lsp_symbols({ scope = "workspace" })
            end,
            desc = "Workspace Symbols",
        },
        {
            "<leader>ly",
            function()
                require("snacks").picker.lsp_type_definitions()
            end,
            desc = "Type Definitions",
        },
        {
            "<leader>s",
            function()
                require("snacks").scratch({
                    file = get_scratch_path() .. "/scratch.md",
                    name = "Scratch",
                    ft = "markdown",
                })
            end,
            desc = "Scratch",
        },
        {
            "<leader>d",
            function()
                require("snacks").bufdelete.delete()
            end,
            desc = "Delete Buffer",
        },
        {
            "<leader>D",
            function()
                require("snacks").bufdelete.all()
            end,
            desc = "All Buffers",
        },
        {
            "<leader>,",
            function()
                require("snacks").bufdelete.delete({
                    filter = function(buf)
                        return vim.fn.bufwinnr(buf) == -1
                    end,
                })
            end,
            desc = "Hidden Buffers",
        },
        {
            "<leader>.",
            function()
                require("snacks").bufdelete.other()
            end,
            desc = "Other Buffers",
        },
        {
            "<leader>gr",
            function()
                require("snacks").gitbrowse({ what = "repo" })
            end,
            mode = { "n", "v" },
            desc = "Repo URL",
        },
        {
            "<leader>gu",
            function()
                require("snacks").gitbrowse({ what = "file" })
            end,
            mode = { "n", "v" },
            desc = "File URL",
        },
        {
            "<leader>gL",
            function()
                require("snacks").lazygit()
            end,
            desc = "Lazygit",
        },
        {
            "<leader>tc",
            function()
                require("snacks").picker.semantic()
            end,
            desc = "Semantic Search (ck)",
        },
        {
            "<leader>td",
            function()
                require("snacks").dashboard()
            end,
            desc = "Dashboard",
        },
        {
            "<leader>ts",
            function()
                require("snacks").scratch()
            end,
            desc = "Toggle Scratch Buffer",
        },
        {
            "<leader>tS",
            function()
                require("snacks").scratch.select()
            end,
            desc = "Select Scratch Buffer",
        },
        {
            "<leader>tu",
            function()
                require("snacks").picker.undo()
            end,
            desc = "Undo History",
        },
        {
            "<leader>ty",
            function()
                require("snacks").picker.yanky()
            end,
            desc = "Yank History",
        },
        {
            "<leader>z",
            function()
                require("snacks").zen.zoom()
            end,
            desc = "Toggle Zoom",
        },
        {
            "<leader>Z",
            function()
                require("snacks").zen()
            end,
            desc = "Toggle Zen Mode",
        },
    },
}

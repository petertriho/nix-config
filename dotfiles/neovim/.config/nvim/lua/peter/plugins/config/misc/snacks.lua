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
    local scratch_path = os.getenv("SCRATCH_PATH")

    if scratch_path then
        return vim.fn.expand(scratch_path)
    else
        return vim.fn.stdpath("data") .. "/scratch"
    end
end

return {
    "folke/snacks.nvim",
    -- priority = 1000,
    -- lazy = false,
    event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        local snacks = require("snacks")

        local select = function(n)
            return function(picker)
                picker:action("list_top")

                if n > 1 then
                    picker.list:move(n - 1)
                end

                picker:action("confirm")
            end
        end

        snacks.setup({
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
                },
                sources = {
                    files = {
                        hidden = true,
                    },
                    grep = {
                        hidden = true,
                    },
                    explorer = {
                        hidden = true,
                        layout = {
                            hidden = { "input" },
                        },
                        focus = "list",
                    },
                },
                win = {
                    input = {
                        keys = {
                            -- ["1"] = { "select_1", mode = { "n", "i" } },
                            -- ["2"] = { "select_2", mode = { "n", "i" } },
                            -- ["3"] = { "select_3", mode = { "n", "i" } },
                            -- ["4"] = { "select_4", mode = { "n", "i" } },
                            -- ["5"] = { "select_5", mode = { "n", "i" } },
                            -- ["6"] = { "select_6", mode = { "n", "i" } },
                            -- ["7"] = { "select_7", mode = { "n", "i" } },
                            -- ["8"] = { "select_8", mode = { "n", "i" } },
                            -- ["9"] = { "select_9", mode = { "n", "i" } },
                            -- ["0"] = { "select_0", mode = { "n", "i" } },
                            ["<c-d>"] = { "preview_scroll_down", mode = { "i", "n" } },
                            ["<c-u>"] = { "preview_scroll_up", mode = { "i", "n" } },
                            ["<c-b>"] = { "list_scroll_up", mode = { "i", "n" } },
                            ["<c-f>"] = { "list_scroll_down", mode = { "i", "n" } },
                            ["<c-l>"] = { "toggle_preview", mode = { "i", "n" } },
                        },
                    },
                },
                actions = {
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
    end,
    keys = {
        {
            "<leader>;",
            function()
                require("snacks").picker.files()
            end,
            desc = "Find Files",
        },
        {
            "<leader>e",
            function()
                require("snacks").picker.explorer()
            end,
            desc = "Explorer",
        },
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
            "<leader>gc",
            function()
                require("snacks").picker.git_log()
            end,
            desc = "Commits",
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
            "<leader>tb",
            function()
                require("snacks").picker.buffers()
            end,
            desc = "Buffers",
        },
        {
            "<leader>tc",
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
            "<leader>b",
            function()
                require("snacks").scratch({
                    file = get_scratch_path() .. "/scratch.md",
                    name = "Scratch",
                    ft = "markdown",
                })
            end,
            desc = "Scratch Buffer",
        },
        {
            "<leader>d",
            function()
                require("snacks").bufdelete.delete({ wipe = true })
            end,
            desc = "Delete Buffer",
        },
        {
            "<leader>D",
            function()
                require("snacks").bufdelete.all({ wipe = true })
            end,
            desc = "All Buffers",
        },
        {
            "<leader>,",
            function()
                require("snacks").bufdelete.delete({
                    wipe = true,
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
                require("snacks").bufdelete.other({ wipe = true })
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

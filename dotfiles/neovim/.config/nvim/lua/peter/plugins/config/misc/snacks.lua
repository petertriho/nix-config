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
                -- layouts = {
                --     select = {
                --         layout = {
                --             relative = "cursor",
                --         },
                --     },
                -- },
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
        })
    end,
    keys = {
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

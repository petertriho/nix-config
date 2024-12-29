return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
        indent = {
            enabled = true,
            filter = function(buf)
                return (
                    vim.g.snacks_indent ~= false
                    and vim.b[buf].snacks_indent ~= false
                    and vim.bo[buf].buftype == ""
                ) or vim.bo[buf].filetype ~= "bigfile"
            end,
        },
        scope = {
            enabled = true,
            filter = function(buf)
                return vim.bo[buf].buftype == "" and vim.bo[buf].filetype ~= "bigfile"
            end,
        },
        statuscolumn = { enabled = true },
    },
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
            "<leader>go",
            function()
                require("snacks").gitbrowse()
            end,
            mode = { "n", "v" },
            desc = "Open URL",
        },
        {
            "<leader>z",
            function()
                Snacks.zen()
            end,
            desc = "Toggle Zen Mode",
        },
        {
            "<leader>Z",
            function()
                Snacks.zen.zoom()
            end,
            desc = "Toggle Zoom",
        },
    },
}

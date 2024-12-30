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
    priority = 1000,
    lazy = false,
    opts = {
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
        scope = {
            enabled = true,
            filter = filter,
        },
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
                require("snacks").zen()
            end,
            desc = "Toggle Zen Mode",
        },
        {
            "<leader>Z",
            function()
                require("snacks").zen.zoom()
            end,
            desc = "Toggle Zoom",
        },
    },
}

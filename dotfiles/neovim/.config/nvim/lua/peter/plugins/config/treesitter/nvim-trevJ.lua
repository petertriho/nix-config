return {
    "AckslD/nvim-trevJ.lua",
    lazy = true,
    init = function()
        vim.keymap.set("n", "<Leader>J", function()
            require("trevj").format_at_cursor()
        end, { desc = "Split lines" })
    end,
}

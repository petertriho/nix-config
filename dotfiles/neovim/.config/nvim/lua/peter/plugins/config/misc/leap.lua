return {
    {
        "ggandor/leap.nvim",
        config = function()
            require("leap").add_default_mappings()
            vim.keymap.del({ "x", "o" }, "x")
            vim.keymap.del({ "x", "o" }, "X")
        end,
    },
    {
        "ggandor/leap-spooky.nvim",
        dependencies = { "ggandor/leap.nvim" },
        config = true,
    },
    {
        "ggandor/flit.nvim",
        dependencies = { "ggandor/leap.nvim" },
        opts = {
            labeled_modes = "nvo",
        },
    },
}

return {
    {
        "ggandor/leap.nvim",
        config = function()
            require("leap").create_default_mappings()
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

return {
    {
        "ggandor/leap.nvim",
        enabled = false,
        config = function()
            require("leap").create_default_mappings()
        end,
    },
    {
        "ggandor/leap-spooky.nvim",
        enabled = false,
        dependencies = { "ggandor/leap.nvim" },
        config = true,
    },
    {
        "ggandor/flit.nvim",
        enabled = false,
        dependencies = { "ggandor/leap.nvim" },
        opts = {
            labeled_modes = "nvo",
        },
    },
}

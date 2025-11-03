return {
    "A7Lavinraj/fyler.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    keys = {
        {
            "<leader>e",
            function()
                require("fyler").toggle({
                    kind = "split_left_most",
                })
            end,
            desc = "Explorer",
        },
    },
    opts = {
        icon_provider = "nvim_web_devicons",
        close_on_select = false,
        confirm_simple = true,
        hooks = {
            on_rename = function(src_path, destination_path)
                require("snacks").rename.on_rename_file(src_path, destination_path)
            end,
        },
        win = {
            kind_presets = {
                split_left_most = {
                    width = "40abs",
                },
            },
        },
    },
}

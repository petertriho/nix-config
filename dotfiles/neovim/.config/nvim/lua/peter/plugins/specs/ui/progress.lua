return {
    -- stdpath keeps the plugin loadable from a test config before a home-manager rebuild.
    dir = vim.fs.joinpath(vim.fn.stdpath("config"), "plugins/progress"),
    event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        require("progress").setup()
    end,
}

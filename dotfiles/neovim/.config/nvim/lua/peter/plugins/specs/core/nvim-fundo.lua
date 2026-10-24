return {
    "kevinhwang91/nvim-fundo",
    event = "User LazyLoadFileDeferred",
    dependencies = { "kevinhwang91/promise-async" },
    build = function()
        require("fundo").install()
    end,
    config = function()
        require("fundo").setup()
    end,
}

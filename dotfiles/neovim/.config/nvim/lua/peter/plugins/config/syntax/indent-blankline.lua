return {
    "lukas-reineke/indent-blankline.nvim",
    event = "User LazyLoadFile",
    config = function()
        require("ibl").setup({
            indent = {
                char = "│",
            },
            scope = {
                show_start = false,
            },
        })

        local hooks = require("ibl.hooks")
        hooks.register(hooks.type.ACTIVE, function(bufnr)
            return not require("peter.core.utils").file_is_big(bufnr)
        end)
    end,
}

return {
    "stevearc/stickybuf.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    opts = {
        get_auto_pin = function(bufnr)
            local filetype = vim.bo[bufnr].filetype
            if require("peter.core.utils").is_ft("excludes", filetype) then
                return "filetype"
            end

            return require("stickybuf").should_auto_pin(bufnr)
        end,
    },
}

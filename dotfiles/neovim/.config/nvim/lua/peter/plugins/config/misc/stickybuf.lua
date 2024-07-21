return {
    "stevearc/stickybuf.nvim",
    opts = {
        get_auto_pin = function(bufnr)
            local filetype = vim.bo[bufnr].filetype

            for _, v in ipairs(require("peter.plugins.filetypes").sidebars) do
                if v == filetype then
                    return "filetype"
                end
            end

            return require("stickybuf").should_auto_pin(bufnr)
        end,
    },
}

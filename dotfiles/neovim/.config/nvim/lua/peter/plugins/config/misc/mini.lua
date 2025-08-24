return {
    "echasnovski/mini.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        {
            "-",
            function()
                local files = require("mini.files")
                if not files.close() then
                    local current_file = vim.api.nvim_buf_get_name(0)
                    local parent_dir = vim.fn.fnamemodify(current_file, ":h")
                    files.open(parent_dir)
                end
            end,
            desc = "Open parent directory",
        },
        {
            "<leader>E",
            function()
                local files = require("mini.files")
                if not files.close() then
                    files.open()
                end
            end,
            desc = "Explorer",
        },
    },
    config = function()
        require("mini.ai").setup()
        require("mini.files").setup()
        require("mini.icons").setup()
        require("mini.splitjoin").setup()
    end,
}

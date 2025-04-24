local close_command = function(bufnr)
    require("snacks").bufdelete({
        buf = bufnr,
        wipe = true,
    })
end

return {
    "akinsho/bufferline.nvim",
    event = { "UIEnter", "VeryLazy" },
    keys = {
        { "<C-n>", "<CMD>BufferLineCycleNext<CR>" },
        { "<C-p>", "<CMD>BufferLineCyclePrev<CR>" },
        { "<leader>1", "<CMD>lua require('bufferline').go_to_buffer(1)<CR>" },
        { "<leader>2", "<CMD>lua require('bufferline').go_to_buffer(2)<CR>" },
        { "<leader>3", "<CMD>lua require('bufferline').go_to_buffer(3)<CR>" },
        { "<leader>4", "<CMD>lua require('bufferline').go_to_buffer(4)<CR>" },
        { "<leader>5", "<CMD>lua require('bufferline').go_to_buffer(5)<CR>" },
        { "<leader>6", "<CMD>lua require('bufferline').go_to_buffer(6)<CR>" },
        { "<leader>7", "<CMD>lua require('bufferline').go_to_buffer(7)<CR>" },
        { "<leader>8", "<CMD>lua require('bufferline').go_to_buffer(8)<CR>" },
        { "<leader>9", "<CMD>lua require('bufferline').go_to_buffer(9)<CR>" },
        { "<leader>0", "<CMD>lua require('bufferline').go_to_buffer(10)<CR>" },
    },
    opts = {
        options = {
            numbers = "ordinal",
            close_command = close_command,
            right_mouse_command = close_command,
            offsets = {
                {
                    filetype = "DiffViewFiles",
                    text = "DIFFVIEW",
                    highlight = "Directory",
                    text_align = "center",
                },
                {
                    filetype = "undotree",
                    text = "UNDOTREE",
                    highlight = "Directory",
                    text_align = "center",
                },
                {
                    filetype = "NvimTree",
                    text = "EXPLORER",
                    highlight = "Directory",
                    text_align = "center",
                },
                {
                    filetype = "Outline",
                    text = "OUTLINE",
                    highlight = "Directory",
                    text_align = "center",
                },
            },
            custom_filter = function(buf_number)
                return vim.bo[buf_number].filetype ~= "fugitive"
                    and vim.bo[buf_number].filetype ~= "NeogitStatus"
                    and vim.bo[buf_number].buftype ~= "terminal"
            end,
            diagnostics = "nvim_lsp",
            diagnostics_indicator = function(count, level, diagnostics_dict, context)
                return "(" .. count .. ")"
            end,
        },
    },
}

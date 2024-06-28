return {
    "akinsho/bufferline.nvim",
    event = "VeryLazy",
    init = function()
        local keymap = vim.keymap.set
        local opts = { noremap = true, silent = true }

        keymap("n", "<C-n>", "<CMD>BufferLineCycleNext<CR>", opts)
        keymap("n", "<C-p>", "<CMD>BufferLineCyclePrev<CR>", opts)
        keymap("n", "<Leader>1", "<CMD>lua require('bufferline').go_to_buffer(1)<CR>", {})
        keymap("n", "<Leader>2", "<CMD>lua require('bufferline').go_to_buffer(2)<CR>", {})
        keymap("n", "<Leader>3", "<CMD>lua require('bufferline').go_to_buffer(3)<CR>", {})
        keymap("n", "<Leader>4", "<CMD>lua require('bufferline').go_to_buffer(4)<CR>", {})
        keymap("n", "<Leader>5", "<CMD>lua require('bufferline').go_to_buffer(5)<CR>", {})
        keymap("n", "<Leader>6", "<CMD>lua require('bufferline').go_to_buffer(6)<CR>", {})
        keymap("n", "<Leader>7", "<CMD>lua require('bufferline').go_to_buffer(7)<CR>", {})
        keymap("n", "<Leader>8", "<CMD>lua require('bufferline').go_to_buffer(8)<CR>", {})
        keymap("n", "<Leader>9", "<CMD>lua require('bufferline').go_to_buffer(9)<CR>", {})
        keymap("n", "<Leader>0", "<CMD>lua require('bufferline').go_to_buffer(10)<CR>", {})
    end,
    opts = {
        options = {
            numbers = "ordinal",
            close_command = "Bwipeout! %d",
            right_mouse_command = "Bwipeout! %d",
            offsets = {
                {
                    filetype = "DiffViewFiles",
                    text = "DIFFVIEW",
                    highlight = "Directory",
                    text_align = "center",
                },
                {
                    filetype = "Mundo",
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

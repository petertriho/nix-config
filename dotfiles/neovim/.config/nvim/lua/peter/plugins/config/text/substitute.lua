return {
    "gbprod/substitute.nvim",
    lazy = true,
    init = function()
        local keymap = vim.keymap.set

        keymap("n", "<Leader>s", "<CMD>lua require('substitute').operator()<CR>", { noremap = true })
        keymap("n", "<Leader>ss", "<CMD>lua require('substitute').line()<CR>", { noremap = true })
        keymap("n", "<Leader>S", "<CMD>lua require('substitute').eol()<CR>", { noremap = true })
        keymap("x", "<Leader>s", "<CMD>lua require('substitute').visual()<CR>", { noremap = true })

        keymap("n", "\\s", "<CMD>lua require('substitute.range').operator()<CR>", { noremap = true })
        keymap("x", "\\s", "<CMD>lua require('substitute.range').visual()<CR>", {})
        keymap("n", "\\ss", "<CMD>lua require('substitute.range').word()<CR>", {})

        keymap("n", "\\S", "<CMD>lua require('substitute.range').operator({ prefix = 'S' })<CR>", { noremap = true })
        keymap("x", "\\S", "<CMD>lua require('substitute.range').visual({ prefix = 'S' })<CR>", {})
        keymap("n", "\\SS", "<CMD>lua require('substitute.range').word({ prefix = 'S' })<CR>", {})

        keymap("n", "cx", "<CMD>lua require('substitute.exchange').operator()<CR>", { noremap = true })
        keymap("n", "cxx", "<CMD>lua require('substitute.exchange').line()<CR>", { noremap = true })
        keymap("x", "X", "<CMD>lua require('substitute.exchange').visual()<CR>", { noremap = true })
        keymap("n", "cxc", "<CMD>lua require('substitute.exchange').cancel()<CR>", { noremap = true })
    end,
    config = function()
        require("substitute").setup({
            on_substitute = function(event)
                require("yanky").init_ring("p", event.register, event.count, event.vmode:match("[vV�]"))
            end,
        })
    end,
}

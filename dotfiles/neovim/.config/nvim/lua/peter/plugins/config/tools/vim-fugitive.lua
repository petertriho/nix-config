return {
    "tpope/vim-fugitive",
    cmd = {
        "G",
        "Gdiffsplit",
        "Git",
        "Gvdiffsplit",
    },
    keys = {
        { "<leader>J", "<CMD>ToggleGitStatus<CR>", desc = "Git Status" },
    },
    init = function()
        vim.keymap.set("n", "g[", "<CMD>diffget //2<CR>", { silent = true, noremap = true })
        vim.keymap.set("n", "g]", "<CMD>diffget //3<CR>", { silent = true, noremap = true })

        vim.api.nvim_create_user_command(
            "ToggleGitStatus",
            require("peter.core.utils").toggle_buffer("fugitive:///*.git*//$", "Git"),
            {}
        )
    end,
}

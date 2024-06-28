return {
    "tpope/vim-fugitive",
    cmd = {
        "G",
        "Gdiffsplit",
        "Git",
        "Gvdiffsplit",
    },
    init = function()
        vim.api.nvim_set_keymap("n", "g[", "<CMD>diffget //2<CR>", { silent = true, noremap = true })
        vim.api.nvim_set_keymap("n", "g]", "<CMD>diffget //3<CR>", { silent = true, noremap = true })
        local function toggle_buffer(buf, open_cmd)
            return function()
                local bufname = vim.fn.bufname(buf)

                if vim.fn.bufexists(bufname) == 1 then
                    vim.cmd("bw " .. bufname)
                else
                    vim.cmd(open_cmd)
                end
            end
        end

        vim.api.nvim_create_user_command("ToggleGitStatus", toggle_buffer("fugitive:///*.git*//$", "Git"), {})
    end,
}

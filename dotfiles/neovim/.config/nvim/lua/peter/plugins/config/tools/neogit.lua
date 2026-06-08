return {
    "NeogitOrg/neogit",
    cmd = {
        "Neogit",
    },
    keys = {
        { "<leader>j", "<CMD>ToggleNeogit<CR>", desc = "Neogit Status" },
    },
    init = function()
        vim.api.nvim_create_user_command("ToggleNeogit", function()
            local current_ft = vim.bo.filetype
            if current_ft == "NeogitStatus" then
                if vim.g.previous_tab then
                    vim.cmd("tabn " .. vim.g.previous_tab)
                end
            else
                vim.g.previous_tab = vim.fn.tabpagenr()
                vim.cmd("Neogit")
            end
        end, { desc = "Neogit Status" })
    end,
    opts = {
        kind = "tab",
        commit_editor = {
            kind = "auto",
        },
        log_view = {
            kind = "auto",
        },
        reflog_view = {
            kind = "auto",
        },
    },
}

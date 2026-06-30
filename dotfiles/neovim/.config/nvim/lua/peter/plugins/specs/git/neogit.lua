return {
    "NeogitOrg/neogit",
    cmd = {
        "Neogit",
    },
    keys = {
        { "<leader>s", "<CMD>ToggleNeogit<CR>", desc = "Git Status" },
    },
    init = function()
        vim.api.nvim_create_user_command("ToggleNeogit", function()
            if vim.bo.filetype == "NeogitStatus" then
                require("neogit").close()
            else
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
        integrations = {
            codediff = true,
            snacks = true,
        },
        diff_viewer = "codediff",
    },
}

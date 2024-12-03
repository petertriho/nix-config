return {
    "NeogitOrg/neogit",
    cmd = {
        "Neogit",
    },
    keys = {
        { "<leader>j", "<CMD>ToggleNeogitStatus<CR>", desc = "Neogit Status" },
    },
    init = function()
        vim.api.nvim_create_user_command(
            "ToggleNeogitStatus",
            require("peter.core.utils").toggle_buffer("NeogitStatus", "Neogit"),
            {}
        )
    end,
    opts = {
        kind = "split_below_all",
        commit_editor = {
            kind = "split_below_all",
        },
        log_view = {
            kind = "split_below_all",
        },
        reflog_view = {
            kind = "split_below_all",
        },
    },
}

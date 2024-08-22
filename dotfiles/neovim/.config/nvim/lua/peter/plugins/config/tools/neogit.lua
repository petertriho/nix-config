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
    config = {
        kind = "auto",
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

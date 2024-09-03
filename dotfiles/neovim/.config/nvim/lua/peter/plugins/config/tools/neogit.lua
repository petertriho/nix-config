return {
    "NeogitOrg/neogit",
    cmd = {
        "Neogit",
    },
    keys = {
        { "<leader>J", "<CMD>ToggleNeogitStatus<CR>", desc = "Neogit Status" },
    },
    init = function()
        vim.api.nvim_create_user_command(
            "ToggleNeogitStatus",
            require("peter.core.utils").toggle_buffer("NeogitStatus", "Neogit"),
            {}
        )
    end,
    config = {
        kind = "split",
        commit_editor = {
            kind = "split",
        },
        log_view = {
            kind = "split",
        },
        reflog_view = {
            kind = "split",
        },
    },
}

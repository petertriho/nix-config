return {
    "MMesch/quickfix-review-nvim",
    cmd = {
        "ReviewAddIssue",
        "ReviewAddSuggestion",
        "ReviewAddNote",
        "ReviewAddPraise",
        "ReviewDelete",
        "ReviewView",
        "ReviewExport",
        "ReviewClear",
        "ReviewSave",
        "ReviewLoad",
        "ReviewSummary",
        "ReviewGoto",
    },
    keys = {
        { "<leader>ca", "<CMD>ReviewAddIssue<CR>", desc = "Add comment (cycle type)" },
        {
            "<leader>cn",
            function()
                require("quickfix-review").cycle_next_comment_type()
            end,
            desc = "Cycle to next type",
        },
        {
            "<leader>cp",
            function()
                require("quickfix-review").cycle_previous_comment_type()
            end,
            desc = "Cycle to previous type",
        },
        { "<leader>cd", "<CMD>ReviewDelete<CR>", desc = "Delete comment at cursor" },
        { "<leader>cv", "<CMD>ReviewView<CR>", desc = "View comment at cursor" },
        { "<leader>ce", "<CMD>ReviewExport<CR>", desc = "Export to markdown and clipboard" },
        { "<leader>cc", "<CMD>ReviewClear<CR>", desc = "Clear all comments" },
        { "<leader>cS", "<CMD>ReviewSummary<CR>", desc = "Show comment summary" },
        { "<leader>cw", "<CMD>ReviewSave<CR>", desc = "Save review to disk" },
        { "<leader>cr", "<CMD>ReviewLoad<CR>", desc = "Load review from disk" },
        { "<leader>co", "<CMD>copen<CR>", desc = "Open quickfix list" },
        { "]r", "<CMD>ReviewNext<CR>", desc = "Next comment" },
        { "[r", "<CMD>ReviewPrev<CR>", desc = "Previous comment" },
        { "<leader>cg", "<CMD>ReviewGoto<CR>", desc = "Jump to real file from diff" },
    },
    opts = {
        keymaps = {
            add_comment_cycle = false,
            cycle_next = false,
            cycle_previous = false,
            delete_comment = false,
            view = false,
            export = false,
            clear = false,
            summary = false,
            save = false,
            load = false,
            open_list = false,
            next_comment = false,
            prev_comment = false,
            goto_real_file = false,
        },
    },
}

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
        { "<leader>ra", "<CMD>ReviewAddIssue<CR>", desc = "Add comment (cycle type)" },
        {
            "<leader>rn",
            function()
                require("quickfix-review").cycle_next_comment_type()
            end,
            desc = "Cycle to next type",
        },
        {
            "<leader>rp",
            function()
                require("quickfix-review").cycle_previous_comment_type()
            end,
            desc = "Cycle to previous type",
        },
        { "<leader>rd", "<CMD>ReviewDelete<CR>", desc = "Delete comment at cursor" },
        { "<leader>rv", "<CMD>ReviewView<CR>", desc = "View comment at cursor" },
        { "<leader>re", "<CMD>ReviewExport<CR>", desc = "Export to markdown and clipboard" },
        { "<leader>rc", "<CMD>ReviewClear<CR>", desc = "Clear all comments" },
        { "<leader>rS", "<CMD>ReviewSummary<CR>", desc = "Show comment summary" },
        { "<leader>rw", "<CMD>ReviewSave<CR>", desc = "Save review to disk" },
        { "<leader>rr", "<CMD>ReviewLoad<CR>", desc = "Load review from disk" },
        { "<leader>ro", "<CMD>copen<CR>", desc = "Open quickfix list" },
        { "]r", "<CMD>ReviewNext<CR>", desc = "Next comment" },
        { "[r", "<CMD>ReviewPrev<CR>", desc = "Previous comment" },
        { "<leader>rg", "<CMD>ReviewGoto<CR>", desc = "Jump to real file from diff" },
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

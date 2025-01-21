return {
    "aznhe21/actions-preview.nvim",
    keys = {
        {
            "<leader>k",
            function()
                require("actions-preview").code_actions()
            end,
            mode = { "n", "v" },
            desc = "Quickfix",
        },
    },
    config = function()
        local actions = require("telescope.actions")
        local state = require("telescope.actions.state")
        local select = function(n)
            return function(bufnr)
                actions.move_to_top(bufnr)
                for _ = 1, n - 1 do
                    actions.move_selection_next(bufnr)
                end
                actions.select_default(bufnr)
            end
        end

        require("actions-preview").setup({
            telescope = vim.tbl_extend("force", require("telescope.themes").get_dropdown(), {
                attach_mappings = function(prompt_bufnr, map)
                    actions.select_default:replace(function()
                        local selection = state.get_selected_entry()
                        actions.close(prompt_bufnr)
                        if not selection then
                            return
                        end

                        selection.value.action:apply()
                    end)

                    for i = 1, 9 do
                        map({ "i", "n" }, tostring(i), select(i))
                    end
                    map({ "i", "n" }, "0", select(10))

                    return true
                end,
                make_value = nil,
                make_make_display = nil,
            }),
        })
    end,
}

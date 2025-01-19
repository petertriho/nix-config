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
            telescope = {
                attach_mappings = function(_, map)
                    for i = 1, 9 do
                        map({ "i", "n" }, tostring(i), select(i))
                    end
                    map({ "i", "n" }, "0", select(10))
                    return true
                end,
            },
        })
    end,
}

local function buffer_keys()
    local keys = {}
    for i = 1, 10 do
        table.insert(keys, {
            "<leader>" .. (i % 10),
            function()
                require("heirline-components.tabline.runtime").switch_by_index(i)
            end,
            desc = "Switch to buffer " .. i,
        })
    end
    table.insert(keys, {
        "gb",
        function()
            require("heirline-components.tabline.runtime").pick()
        end,
        desc = "Pick buffer",
    })
    return keys
end

return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    dependencies = {
        -- "Zeioth/heirline-components.nvim",
        {
            dir = "~/.config/nvim/plugins/heirline-components",
        },
    },
    keys = buffer_keys(),
    init = function()
        vim.opt.laststatus = 2
        vim.o.showtabline = 2
        local augroup = vim.api.nvim_create_augroup("HeirlineNobuflisted", { clear = true })
        vim.api.nvim_create_autocmd("FileType", {
            group = augroup,
            pattern = "*",
            callback = function()
                if vim.tbl_contains({ "wipe", "delete" }, vim.bo.bufhidden) then
                    vim.bo.buflisted = false
                end
            end,
            desc = "Mark wipe/delete-bufhidden buffers as nobuflisted",
        })
    end,
    config = function()
        local heirline = require("heirline")
        local conditions = require("heirline.conditions")
        local filetypes = require("peter.core.filetypes")

        require("heirline-components").setup()

        heirline.setup({
            statusline = require("heirline-components.statusline"),
            tabline = require("heirline-components.tabline"),
            winbar = require("heirline-components.winbar"),
            opts = {
                colors = require("heirline-components.colors").get,
                disable_winbar_cb = function(args)
                    return conditions.buffer_matches({
                        buftype = { "nofile", "prompt", "help", "quickfix" },
                        filetype = filetypes.excludes,
                    }, args.buf)
                end,
            },
        })
    end,
}

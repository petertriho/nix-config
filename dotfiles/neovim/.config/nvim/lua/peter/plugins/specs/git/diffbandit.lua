return {
    "CoreyKaylor/diffbandit.nvim",
    cmd = {
        "DiffBandit",
        "DiffBanditBuffers",
        "DiffBanditFolderDiff",
        "DiffBanditGit",
        "DiffBanditGitCurrent",
        "DiffBanditGitMenu",
        "DiffBanditGitLog",
        "DiffBanditGitCommit",
        "DiffBanditGitCompare",
        "DiffBanditGitCheckout",
        "DiffBanditMerge",
        "DiffBanditCommitPanel",
    },
    keys = {
        { "<leader>gg", "<CMD>DiffBanditGit<CR>", desc = "Repo Changes" },
        { "<leader>gi", "<CMD>DiffBanditGitCurrent<CR>", desc = "Diff Current File" },
        { "<leader>gp", "<CMD>DiffBanditCommitPanel<CR>", desc = "Commit Panel" },
        { "<leader>go", "<CMD>DiffBanditGitMenu<CR>", desc = "Git Menu" },
        { "<leader>gm", "<CMD>DiffBanditMerge<CR>", desc = "Merge Conflicts" },
        { "<leader>gv", ":DiffBandit ", desc = "Diff Two Files" },
    },
    config = function()
        local diffbandit = require("diffbandit")
        diffbandit.setup()

        -- render-markdown conceals lines and adds virtual rows, so the rows of a
        -- markdown pane drift from its line-number gutter. Its extmarks belong
        -- to the buffer, so turn it off for the buffers of a diffbandit tab
        -- while that tab is current, and back on when the tab is left.
        local disabled = {}
        local function set_render_markdown(buf, enable)
            vim.api.nvim_buf_call(buf, function()
                require("render-markdown").set_buf(enable)
            end)
        end
        local function sync_render_markdown()
            if package.loaded["render-markdown"] == nil then
                return
            end
            local shown = {}
            if diffbandit.is_running({ tab = vim.api.nvim_get_current_tabpage() }) then
                for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
                    shown[vim.api.nvim_win_get_buf(win)] = true
                end
            end
            for buf in pairs(disabled) do
                if not shown[buf] then
                    disabled[buf] = nil
                    if vim.api.nvim_buf_is_valid(buf) then
                        set_render_markdown(buf, true)
                    end
                end
            end
            for buf in pairs(shown) do
                if not disabled[buf] then
                    disabled[buf] = true
                    set_render_markdown(buf, false)
                end
            end
        end
        vim.api.nvim_create_autocmd({ "TabEnter", "BufWinEnter" }, {
            group = vim.api.nvim_create_augroup("DiffBanditRenderMarkdown", { clear = true }),
            -- diffbandit opens its tab, and loads the next file of a queue,
            -- before it registers the session and its buffers.
            callback = vim.schedule_wrap(sync_render_markdown),
        })
    end,
}

return {
    "awslabs/amazonq.nvim",
    cmd = "AmazonQ",
    keys = {
        {
            "<leader>ac",
            "<CMD>AmazonQ context<CR>",
            desc = "Context",
        },
        {
            "<leader>ae",
            "<CMD>AmazonQ explain<CR>",
            desc = "Explain",
            mode = { "n", "v" },
        },
        {
            "<leader>af",
            "<CMD>AmazonQ fix<CR>",
            desc = "Fix code",
            mode = { "n", "v" },
        },
        {
            "<leader>ah",
            "<CMD>AmazonQ help<CR>",
            desc = "Help",
        },
        {
            "<leader>al",
            "<CMD>AmazonQ login<CR>",
            desc = "Login",
        },
        {
            "<leader>aL",
            "<CMD>AmazonQ logout<CR>",
            desc = "Logout",
        },
        {
            "<leader>ao",
            "<CMD>AmazonQ optimize<CR>",
            desc = "Optimize",
            mode = { "n", "v" },
        },
        {
            "<leader>ar",
            "<CMD>AmazonQ refactor<CR>",
            desc = "Refactor",
            mode = { "n", "v" },
        },
        {
            "<leader>at",
            "<CMD>AmazonQ toggle<CR>",
            desc = "Toggle",
        },
        {
            "<leader>aq",
            "<CMD>AmazonQ<CR>",
            desc = "AmazonQ",
            mode = { "n", "v" },
        },
        {
            "<leader>ax",
            "<CMD>AmazonQ clear<CR>",
            desc = "Clear",
        },
    },
    config = function()
        local ssoStartUrl = vim.env.AMAZONQ_SSO_START_URL or "https://view.awsapps.com/start"

        require("amazonq").setup({
            ssoStartUrl = ssoStartUrl,
            inline_suggestion = false,
            on_chat_open = function()
                vim.cmd("vertical botright split")
                vim.cmd("set wrap breakindent nonumber norelativenumber nolist")
            end,
        })
    end,
}

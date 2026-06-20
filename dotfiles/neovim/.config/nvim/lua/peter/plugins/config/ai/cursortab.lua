return {
    "cursortab/cursortab.nvim",
    lazy = false,
    cond = function()
        return vim.env.MERCURY_AI_TOKEN ~= nil and vim.env.MERCURY_AI_TOKEN ~= ""
    end,
    build = "cd server && go build",
    opts = {
        keymaps = {
            accept = "<Tab>",
            partial_accept = "<S-Tab>",
            trigger = "<C-e>",
        },
        provider = {
            type = "mercuryapi",
            api_key_env = "MERCURY_AI_TOKEN",
        },
    },
}

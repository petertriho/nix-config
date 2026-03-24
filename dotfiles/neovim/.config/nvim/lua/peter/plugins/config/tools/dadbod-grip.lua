return {
    "joryeugene/dadbod-grip.nvim",
    dependencies = {
        { "tpope/vim-dadbod", lazy = true },
    },
    cmd = {
        "Grip",
        "GripToggle",
        "GripConnect",
        "GripTables",
        "GripQuery",
        "GripSchema",
        "GripHistory",
    },
    opts = {
        completion = false,
        picker = "snacks",
        ai = {
            provider = "openai",
            model = vim.env.GRIP_MODEL,
            api_key = vim.env.GRIP_API_KEY,
            base_url = vim.env.GRIP_BASE_URL,
        },
    },
}

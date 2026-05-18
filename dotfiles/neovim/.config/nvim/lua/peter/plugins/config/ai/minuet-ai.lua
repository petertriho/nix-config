local api_key_env = "MINUET_OPENAI_COMPATIBLE_API_KEY"
local end_point_env = "MINUET_OPENAI_COMPATIBLE_END_POINT"
local model_env = "MINUET_OPENAI_COMPATIBLE_MODEL"

local has_openai_compatible_env = function()
    return vim.env[api_key_env] ~= nil
        and vim.env[api_key_env] ~= ""
        and vim.env[end_point_env] ~= nil
        and vim.env[end_point_env] ~= ""
        and vim.env[model_env] ~= nil
        and vim.env[model_env] ~= ""
end

return {
    "milanglacier/minuet-ai.nvim",
    cond = has_openai_compatible_env,
    event = "InsertEnter",
    cmd = "Minuet",
    opts = {
        provider = "openai_compatible",
        request_timeout = 3,
        throttle = 1500,
        debounce = 600,
        provider_options = {
            openai_compatible = {
                api_key = api_key_env,
                end_point = vim.env[end_point_env],
                model = vim.env[model_env],
                name = "AI",
                optional = {
                    max_tokens = 56,
                    top_p = 0.9,
                    thinking = { type = "disabled" },
                },
            },
        },
        lsp = {
            enabled_ft = { "*" },
            completion = {
                enable = false,
            },
            inline_completion = {
                enable = true,
                enabled_auto_trigger_ft = { "*" },
            },
        },
        -- virtualtext = {
        --     auto_trigger_ft = { "*" },
        --     keymap = {
        --         -- accept = nil,
        --         -- accept_line = nil,
        --         -- accept_n_lines = nil,
        --         -- prev = nil,
        --         -- next = nil,
        --         -- dismiss = nil,
        --     },
        -- },
    },
}

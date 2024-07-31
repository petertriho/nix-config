-- https://github.com/L3MON4D3/LuaSnip/blob/master/Examples/snippets.lua
local M = {}

local ls = require("luasnip")
local s = ls.snippet
local sn = ls.snippet_node
local t = ls.text_node
local i = ls.insert_node
local f = ls.function_node
local c = ls.choice_node
local d = ls.dynamic_node
local r = ls.restore_node
local l = require("luasnip.extras").lambda
local rep = require("luasnip.extras").rep
local p = require("luasnip.extras").partial
local m = require("luasnip.extras").match
local n = require("luasnip.extras").nonempty
local dl = require("luasnip.extras").dynamic_lambda
local fmt = require("luasnip.extras.fmt").fmt
local fmta = require("luasnip.extras.fmt").fmta
local types = require("luasnip.util.types")
local conds = require("luasnip.extras.conditions")
local conds_expand = require("luasnip.extras.conditions.expand")

M.setup = function()
    ls.add_snippets("all", {
        s("refs", {
            f(function()
                return string.format(
                    "Refs: https://%s.atlassian.net/browse/%s-",
                    os.getenv("ATLASSIAN_COMPANY_NAME") or "COMPANY_NAME",
                    os.getenv("ATLASSIAN_PROJECT_KEY") or "PROJECT_KEY"
                )
            end, {}),
        }),
    }, { key = "all" })

    ls.add_snippets("javascript", {
        s("log", {
            t("console.log("),
            f(function(_, snip)
                return snip.env.TM_SELECTED_TEXT[1] or {}
            end, {}),
            t(")"),
        }),
    })

    ls.add_snippets("yaml", {
        s("amd", {
            t("platform: linux/amd64"),
        }),
        s("arm", {
            t("platform: linux/arm64"),
        }),
    })
end

return M

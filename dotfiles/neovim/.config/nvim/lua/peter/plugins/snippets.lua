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
    -- ls.add_snippets("all", {}, { key = "all" })

    ls.add_snippets("javascript", {
        s("log", {
            t("console.log("),
            f(function(_, snip)
                return snip.env.TM_SELECTED_TEXT[1] or {}
            end, {}),
            t(")"),
        }),
    })

    local atlassian_company_name = os.getenv("ATLASSIAN_COMPANY_NAME") or "COMPANY_NAME"
    local atlassian_project_key = os.getenv("ATLASSIAN_PROJECT_KEY") or "PROJECT_KEY"
    local refsx_snippet = function(trigger)
        return s(
            trigger,
            fmt(
                string.format(
                    [[
           %s-{1}: {3}

           Refs: https://%s.atlassian.net/browse/%s-{2}
           ]],
                    atlassian_project_key,
                    atlassian_company_name,
                    atlassian_project_key
                ),
                { i(1, "1234"), rep(1), i(2, "commit message") }
            )
        )
    end

    ls.add_snippets("gitcommit", {
        s("flake", {
            t("chore(nix): update `flake.lock`"),
        }),
        s("lazy", {
            t("chore(nvim): update `lazy-lock.json`"),
        }),
        s("refs", {
            f(function()
                return string.format(
                    "Refs: https://%s.atlassian.net/browse/%s-",
                    atlassian_company_name,
                    atlassian_project_key
                )
            end, {}),
        }),
        refsx_snippet("refsx"),
        refsx_snippet(atlassian_project_key),
    })
    ls.filetype_extend("NeogitCommitMessage", { "gitcommit" })
    ls.filetype_extend("markdown", { "gitcommit" })

    ls.add_snippets("go", {
        s(
            "testfunc",
            fmt(
                [[
            func Test{1}(t *testing.T) {{
                var tests = []struct {{
                    input  string
                    output string
                }}{{
                }}

                for _, tt := range tests {{
                    testname := fmt.Sprintf("%v,%v", tt.input, tt.output)
                    t.Run(testname, func(t *testing.T) {{
                        output := {2}(tt.input)
                        if output != tt.output {{
                            t.Errorf("got %v, expected %v", output, tt.output)
                        }}
                    }})
                }}
            }}
        ]],
                { i(1, "Foo"), i(2, "Bar") }
            )
        ),
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

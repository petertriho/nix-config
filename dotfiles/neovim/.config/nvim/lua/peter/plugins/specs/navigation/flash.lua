-- Monkey-patch flash.hacks for nvim 0.13's new SearchState struct.
-- From https://github.com/folke/flash.nvim/pull/492 (fixes #491).
-- TODO: remove when the PR is merged upstream.
local function patch_flash_searchstate()
    local Hacks = require("flash.hacks")
    local ffi = require("ffi")

    -- New: SearchState struct (src/nvim/search_defs.h), exported global `Search`.
    pcall(
        ffi.cdef,
        [[
      typedef struct {
        bool    hl_match;
        int32_t match_lines;
        int     match_endcol;
        int32_t first_line;
        int32_t last_line;
        bool    no_smartcase;
        int     cmdlen;
        bool    no_hlsearch;
      } SearchState;
      SearchState Search;
    ]]
    )

    local C = ffi.C
    local Pos = require("flash.search.pos")
    local incsearch_state = {}

    function Hacks.get_end_pos(from)
        local ret = Pos({
            from[1] + C.Search.match_lines,
            math.max(0, C.Search.match_endcol - 1),
        })
        local line = vim.api.nvim_buf_get_lines(0, ret[1] - 1, ret[1], false)[1]
        local char_idx = vim.fn.charidx(line, ret[2])
        ret[2] = vim.fn.byteidx(line, char_idx)
        return ret
    end

    function Hacks.save_incsearch_state()
        incsearch_state = {
            match_endcol = C.Search.match_endcol,
            match_lines = C.Search.match_lines,
        }
    end

    function Hacks.restore_incsearch_state()
        C.Search.match_endcol = incsearch_state.match_endcol
        C.Search.match_lines = incsearch_state.match_lines
    end
end

return {
    "folke/flash.nvim",
    keys = {
        {
            "s",
            mode = { "n", "x", "o" },
            function()
                require("flash").jump()
            end,
            desc = "Flash",
        },
        {
            "S",
            mode = { "n", "x", "o" },
            function()
                require("flash").treesitter()
            end,
            desc = "Flash Treesitter",
        },
        {
            "r",
            mode = "o",
            function()
                require("flash").remote()
            end,
            desc = "Remote Flash",
        },
        -- {
        --     "R",
        --     mode = { "o", "x" },
        --     function()
        --         require("flash").treesitter_search()
        --     end,
        --     desc = "Treesitter Search",
        -- },
        {
            "<c-s>",
            mode = { "c" },
            function()
                require("flash").toggle()
            end,
            desc = "Toggle Flash Search",
        },
    },
    opts = {
        jump = {
            autojump = true,
        },
        search = {
            multi_window = false,
        },
        modes = {
            search = {
                enabled = true,
            },
            char = {
                enabled = false,
            },
        },
    },
    config = function(_, opts)
        -- TODO: remove patch when https://github.com/folke/flash.nvim/pull/492 is merged
        patch_flash_searchstate()
        require("flash").setup(opts)
    end,
}

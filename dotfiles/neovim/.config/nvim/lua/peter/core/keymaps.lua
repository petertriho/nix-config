local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Buffers: Navigation
keymap("", "<C-n>", "<CMD>bnext<CR>", { desc = "Next Buffer" })
keymap("", "<C-p>", "<CMD>bprev<CR>", { desc = "Previous Buffer" })
keymap("", "<S-l>", "<CMD>bnext<CR>", { desc = "Next Buffer" })
keymap("", "<S-h>", "<CMD>bprev<CR>", { desc = "Previous Buffer" })
keymap("", "<S-m>", "<C-^>", { desc = "Alternate Buffer" })

-- Windows: Navigation
keymap("", "<C-j>", "<C-w>j", {})
keymap("", "<C-k>", "<C-w>k", {})
keymap("", "<C-h>", "<C-w>h", {})
keymap("", "<C-l>", "<C-w>l", {})
keymap("", "<C-\\>", "<C-w>p", {})

-- Exchange lines
keymap("n", "]e", ":m .+1<CR>==", { unpack(opts), desc = "Exchange Below" })
keymap("n", "[e", ":m .-2<CR>==", { unpack(opts), desc = "Exchange Above" })
keymap("x", "]e", ":m '>+1<CR>gv=gv", { unpack(opts), desc = "Exchange Below" })
keymap("x", "[e", ":m '<-2<CR>gv=gv", { unpack(opts), desc = "Exchange Above" })

-- Diagnostics: next/prev
keymap("n", "]d", function()
    vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Next Diagnostic" })
keymap("n", "[d", function()
    vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Prev Diagnostic" })

-- Line Text Objects
keymap("v", "al", ":<C-u>norm!0v$h<CR>", { unpack(opts), desc = "Outer Line" })
keymap("v", "il", ":<C-u>norm!^vg_<CR>", { unpack(opts), desc = "Inner Line" })
keymap("o", "al", ":norm val<CR>", { unpack(opts), desc = "Outer Line" })
keymap("o", "il", ":norm vil<CR>", { unpack(opts), desc = "Inner Line" })

-- Search: In Visual Selection
keymap("x", "gv", [[<Esc>/\%V]], {})

-- ESC to turn off hlsearch
keymap("n", "<ESC>", function()
    vim.cmd.nohlsearch()
    pcall(require("snacks").notifier.hide)
end, {
    desc = "Hide",
})

-- Terminal
keymap("t", "<C-q>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Incremental Selection
vim.keymap.set({ "x", "o" }, "v", function()
    if vim.treesitter.get_parser(nil, nil, { error = false }) then
        vim.treesitter.select("parent", vim.v.count1)
    else
        vim.lsp.buf.selection_range(vim.v.count1)
    end
end, { desc = "Select parent (outer) node" })

vim.keymap.set({ "x", "o" }, "V", function()
    if vim.treesitter.get_parser(nil, nil, { error = false }) then
        vim.treesitter.select("child", vim.v.count1)
    else
        vim.lsp.buf.selection_range(-vim.v.count1)
    end
end, { desc = "Select child (inner) node" })

-- Leader
vim.g.mapleader = " "
vim.g.localleader = "\\"

keymap("", "<leader><leader>", "<CMD>update<CR>", { desc = "Update" })
keymap("", "<leader>-", "<C-w>s", { desc = "Split Below" })
keymap("", "<leader>\\", "<C-w>v", { desc = "Split Right" })

keymap("n", "<leader>/", "gcc", { desc = "Comment", remap = true })
keymap("v", "<leader>/", "gc", { desc = "Comment", remap = true })

-- Quickfix
local function qf_navigate(direction)
    local qf_list = vim.fn.getqflist()
    if #qf_list == 0 then
        return
    end
    local current = vim.fn.getqflist({ idx = 0 }).idx

    local commands = {
        next = current == #qf_list and "cfirst" or "cnext",
        prev = current == 1 and "clast" or "cprev",
    }
    vim.cmd(commands[direction])
end

keymap("", "qn", function()
    qf_navigate("next")
end, { unpack(opts), desc = "QF Next" })
keymap("", "qp", function()
    qf_navigate("prev")
end, { unpack(opts), desc = "QF Prev" })

keymap("", "Q", function()
    vim.fn.setqflist({}, "a", {
        items = {
            {
                bufnr = vim.api.nvim_get_current_buf(),
                lnum = vim.api.nvim_win_get_cursor(0)[1],
                text = vim.api.nvim_get_current_line(),
            },
        },
    })
end, { unpack(opts), desc = "QF Add" })

-- Register
keymap({ "n", "v" }, "<leader>y", [["+y]], { desc = "Yank+" })
keymap("n", "<leader>Y", [["+Y]], { desc = "Yank+ EOL", remap = true })
keymap({ "n", "v" }, "<leader>p", [["+p]], { desc = "Put+" })
keymap({ "n", "v" }, "<leader>P", [["+P]], { desc = "Put+ Before" })
keymap({ "n", "v" }, "<leader>x", [["_d]], { desc = "Delete_" })
keymap({ "n", "v" }, "<leader>X", [["+d]], { desc = "Delete+" })

keymap("n", "<leader>ig", [["+gp]], { desc = "gput+" })
keymap("n", "<leader>iG", [["+gP]], { desc = "gPut+" })

keymap("n", "<leader>iy", "<CMD>%y+<CR>", { desc = "Yank File" })
keymap("n", "<leader>ip", 'ggVG"+p', { desc = "Put File" })

-- AI prompt scratch files
-- Resolve /tmp so the root matches nvim's symlink-resolved buffer names
-- (on macOS /tmp -> /private/tmp), keeping the exclusion check below working.
local ai_prompt_root = vim.fn.resolve("/tmp") .. "/ai-prompt"

local function ensure_ai_prompt_root()
    vim.fn.mkdir(ai_prompt_root, "p")
end

local function ai_prompt_today_dir()
    return ai_prompt_root .. "/" .. os.date("%Y-%m-%d")
end

local function open_ai_prompt_split(path)
    vim.cmd("split " .. vim.fn.fnameescape(path))
end

local function new_ai_prompt_path(dir)
    return dir .. "/" .. ("%s-%08x.md"):format(os.date("%H%M%S"), vim.fn.rand())
end

keymap("n", "<leader>an", function()
    local dir = ai_prompt_today_dir()
    vim.fn.mkdir(dir, "p")

    local path = new_ai_prompt_path(dir)
    if vim.fn.writefile({}, path) ~= 0 then
        vim.notify("Failed to create " .. path, vim.log.levels.ERROR)
        return
    end

    vim.g.ai_prompt_last_file = path
    open_ai_prompt_split(path)
end, { desc = "AI Prompt New" })

keymap("n", "<leader>aN", function()
    if not vim.g.ai_prompt_last_file then
        vim.notify("No AI prompt scratch file in this session", vim.log.levels.WARN)
        return
    end

    open_ai_prompt_split(vim.g.ai_prompt_last_file)
end, { desc = "AI Prompt Previous" })

keymap("n", "<leader>af", function()
    ensure_ai_prompt_root()
    require("snacks").picker.files({ cwd = ai_prompt_root, confirm = "edit_split" })
end, { desc = "AI Prompt Files" })

keymap("n", "<leader>ag", function()
    ensure_ai_prompt_root()
    require("snacks").picker.grep({ cwd = ai_prompt_root, confirm = "edit_split" })
end, { desc = "AI Prompt Grep" })

-- Copy @-prefixed paths (for AI / sharing)
keymap("n", "<leader>ap", function()
    local paths = {}
    for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.bo[bufnr].buflisted and vim.api.nvim_buf_is_loaded(bufnr) then
            local name = vim.api.nvim_buf_get_name(bufnr)
            if name ~= "" and not vim.startswith(name, ai_prompt_root .. "/") then
                local rel = vim.fn.fnamemodify(name, ":.")
                table.insert(paths, "@" .. rel)
            end
        end
    end
    local result = table.concat(paths, "\n")
    vim.fn.setreg("+", result)
    vim.notify("Copied: " .. #paths .. " buffer path(s)")
end, { desc = "@all" })

keymap("n", "<leader>ab", function()
    local path = vim.fn.expand("%:.")
    vim.fn.setreg("+", "@" .. path)
    vim.notify("Copied: @" .. path)
end, { desc = "@buffer" })

keymap("x", "<leader>av", function()
    local path = vim.fn.expand("%:.")
    local start_line = vim.fn.line("'<")
    local end_line = vim.fn.line("'>")
    local result = "@" .. path .. "#L" .. start_line .. "-" .. end_line
    vim.fn.setreg("+", result)
    vim.notify("Copied: " .. result)
end, { desc = "@buffer#L1:2" })

-- Send current buffer text to an agent pane in the current tmux session.
keymap("n", "<leader>as", function()
    local processes = { "claude", "opencode", "pi" }
    local bufnr = vim.api.nvim_get_current_buf()
    local buffer_path = vim.api.nvim_buf_get_name(bufnr)
    local is_ai_prompt_buffer = buffer_path ~= "" and vim.startswith(vim.fn.resolve(buffer_path), ai_prompt_root .. "/")
    local content = table.concat(vim.api.nvim_buf_get_lines(0, 0, -1, false), "\n")

    if content == "" then
        vim.notify("Current buffer is empty", vim.log.levels.WARN)
        return
    end

    local target, target_error = require("peter.core.tmux").find_pane(processes, "-s")
    if target_error then
        vim.fn.setreg("+", content)
        vim.notify(target_error .. ", copied buffer to clipboard", vim.log.levels.WARN)
        return
    end

    if not target then
        vim.fn.setreg("+", content)
        vim.notify(
            "No tmux pane found running " .. table.concat(processes, "/") .. ", copied buffer to clipboard",
            vim.log.levels.WARN
        )
        return
    end

    local temp_file = vim.fn.tempname()
    local file = io.open(temp_file, "wb")
    if not file then
        vim.fn.setreg("+", content)
        vim.notify("Failed to create temp file, copied buffer to clipboard", vim.log.levels.ERROR)
        return
    end

    file:write(content)
    file:close()

    local buffer_name = "nvim-agent-send-" .. vim.fn.getpid()
    vim.fn.system({ "tmux", "load-buffer", "-b", buffer_name, temp_file })
    vim.fn.delete(temp_file)
    if vim.v.shell_error ~= 0 then
        vim.fn.setreg("+", content)
        vim.notify("Failed to load tmux buffer, copied buffer to clipboard", vim.log.levels.ERROR)
        return
    end

    vim.fn.system({ "tmux", "paste-buffer", "-b", buffer_name, "-p", "-t", target })
    local paste_failed = vim.v.shell_error ~= 0
    vim.fn.system({ "tmux", "delete-buffer", "-b", buffer_name })

    if paste_failed then
        vim.fn.setreg("+", content)
        vim.notify("Failed to send buffer to " .. target .. ", copied buffer to clipboard", vim.log.levels.ERROR)
        return
    end

    if is_ai_prompt_buffer then
        local saved = pcall(vim.cmd.write)
        if not saved then
            vim.notify("Sent buffer to " .. target .. " but failed to save prompt file", vim.log.levels.WARN)
        elseif vim.fn.winnr("$") > 1 then
            vim.cmd.close()
        else
            vim.cmd.bdelete()
        end
    end

    local window_id
    local window_info = vim.fn.system({ "tmux", "list-panes", "-s", "-F", "#{pane_id} #{window_id}" })
    if vim.v.shell_error == 0 then
        for line in window_info:gmatch("[^\n]+") do
            local pane_id, pane_window_id = line:match("^(%S+)%s+(%S+)$")
            if pane_id == target then
                window_id = pane_window_id
                break
            end
        end
    end

    local switch_failed = false
    if window_id then
        vim.fn.system({ "tmux", "select-window", "-t", window_id })
        switch_failed = vim.v.shell_error ~= 0
    end

    vim.fn.system({ "tmux", "select-pane", "-t", target })
    switch_failed = switch_failed or vim.v.shell_error ~= 0

    if switch_failed then
        vim.notify("Sent buffer to " .. target .. " but failed to switch pane", vim.log.levels.WARN)
    end
end, { desc = "Send Buffer to Agent" })

-- Diagnostics
keymap("n", "<leader>cx", function()
    vim.diagnostic.setqflist()
end, { desc = "Diagnostics QF" })
keymap("n", "<leader>cX", function()
    vim.diagnostic.setqflist({ bufnr = 0 })
end, { desc = "Buffer Diagnostics QF" })
keymap("n", "<leader>cl", function()
    vim.diagnostic.setloclist()
end, { desc = "Diagnostics Loclist" })

-- Insert helpers
keymap("", "<leader>ic", ":!<Up><CR>", { desc = "Last Command" })
keymap("", "<leader>ie", ":!chmod +x %<CR>", { desc = "Executable" })

-- Tools
keymap("n", "<leader>tu", function()
    if not vim.g.loaded_undotree_plugin then
        vim.cmd.packadd("nvim.undotree")
    end
    require("undotree").open()
end, { desc = "Undotree" })

---@class progress.Task
---@field id string|integer Message id.
---@field source string
---@field title string
---@field text string
---@field suffix string? Kept visible when `text` is cut, for example the elapsed time.
---@field percent integer?
---@field status "running"|"success"|"failed"|"cancel"
---@field owned boolean The plugin echoes state changes. Foreign sources echo their own.
---@field started integer hrtime
---@field updated integer hrtime
---@field finished integer? hrtime
---@field dirty boolean A state change is not on screen yet.
---@field idle_timeout_ms integer? Remove the task after this long with no update.
---@field alive (fun(): boolean)? Checked on each frame.
---@field on_stale fun()? Called when the store removes the task for idleness or `alive`.
---@field detail string? Shown under the row, wrapped and limited. `:messages` keeps the full text.
---@field lifetime_ms integer? How long a finished row stays visible.
---@field hidden boolean? The user dismissed the row. Only a failure shows it again.
---@field title_cell string? Cached fixed-width title.
---@field text_cell string? Cached fixed-width text.

---@class progress.ReportFields
---@field source string
---@field title string
---@field text string
---@field suffix string?
---@field percent number?
---@field idle_timeout_ms integer?
---@field alive (fun(): boolean)?
---@field on_stale fun()?

---@class progress.FinishFields
---@field source string?
---@field title string?
---@field text string?
---@field percent number?
---@field detail string?
---@field lifetime_ms integer?

local M = {}

local api = vim.api
local uv = vim.uv

local FRAME_MS = 100
local SUCCESS_MS = 2000
local FAILURE_MS = 8000
local FOREIGN_IDLE_MS = 60000
-- Core operations run synchronously, so a core row with no recent update has ended.
local CORE_IDLE_MS = 5000

-- ui2 sizes the msg window to its longest line, so these values set the window width.
-- The first line of a row is the icon (3), the title, a space, the bar, and the percent (6).
-- The second line is the indent (3), the text, and a space. Both lines are 30 cells.
local TITLE_WIDTH = 12
local BAR_WIDTH = 8
local BAR_BLOCK = 3
local TEXT_WIDTH = 26
local INDENT = "   "
-- The window shows its last line, so a taller failure row would lose its first line.
local DETAIL_LINES = 6

local SPINNER = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }

local HIGHLIGHTS = {
    ProgressSpinner = "DiagnosticInfo",
    ProgressTitle = "Title",
    ProgressBarDone = "DiagnosticInfo",
    ProgressBarTodo = "NonText",
    ProgressPercent = "Comment",
    ProgressOk = "DiagnosticOk",
    ProgressFail = "DiagnosticError",
}

local hl_ids = {} ---@type table<string, integer>

---@type table<string|integer, progress.Task>
local tasks = {}

local initialized = false
local enabled = false
local hooked = false
local ui ---@type table
local messages ---@type table
local loop ---@type table?
local wake_pending = false
-- The next msg_show with this id updates state only. The row must not be drawn.
local silent_id ---@type string|integer?

local function set_highlights()
    for name, link in pairs(HIGHLIGHTS) do
        api.nvim_set_hl(0, name, { link = link, default = true })
        hl_ids[name] = api.nvim_get_hl_id_by_name(name)
    end
end

---@param id string|integer
---@param owned boolean
---@param now integer
---@return progress.Task
local function new_task(id, owned, now)
    local task = {
        id = id,
        source = "",
        title = "",
        text = "",
        status = "running",
        owned = owned,
        started = now,
        updated = now,
        dirty = false,
    }
    tasks[id] = task
    return task
end

---@param percent any
---@return integer?
local function clamp_percent(percent)
    if type(percent) ~= "number" then
        return nil
    end
    return math.max(0, math.min(100, math.floor(percent)))
end

---@param duration_ns number
---@return string?
local function format_elapsed(duration_ns)
    local ms = duration_ns / 1e6
    if ms < 1 then
        return nil
    elseif ms < 1000 then
        return (" · %dms"):format(ms)
    end
    return (" · %.1fs"):format(ms / 1000)
end

--- Return the longest start of `text` that fits in `width` display cells.
---@param text string
---@param width integer
---@return string
local function cut(text, width)
    local head = vim.fn.strcharpart(text, 0, width)
    -- strcharpart counts characters, so wide characters can still overflow.
    while api.nvim_strwidth(head) > width do
        head = vim.fn.strcharpart(head, 0, vim.fn.strchars(head) - 1)
    end
    return head
end

--- Cut `text` to `width` display cells and pad it to exactly that width.
---@param text string
---@param width integer
---@return string
local function fit(text, width)
    text = text:gsub("%s+", " ")
    local cells = api.nvim_strwidth(text)
    if cells <= width then
        return text .. (" "):rep(width - cells)
    end

    local head = cut(text, width - 1)
    return head .. "…" .. (" "):rep(width - 1 - api.nvim_strwidth(head))
end

--- Wrap `detail` to the text column and limit its height.
---@param detail string
---@return string[]
local function wrap_detail(detail)
    local lines = {}
    for line in vim.gsplit(detail:gsub("\t", "  "), "\n", { plain = true }) do
        while api.nvim_strwidth(line) > TEXT_WIDTH do
            -- One extra cell finds a space directly after a word that fits exactly.
            local head = cut(line, TEXT_WIDTH + 1):match("^(.*%S) ") or cut(line, TEXT_WIDTH)
            lines[#lines + 1] = head
            line = line:sub(#head + 1):gsub("^ +", "")
        end
        -- Blank lines would use up the limit.
        if line:find("%S") then
            lines[#lines + 1] = line
        end
    end

    if #lines > DETAIL_LINES then
        local more = #lines - DETAIL_LINES + 1
        lines = vim.list_slice(lines, 1, DETAIL_LINES - 1)
        lines[DETAIL_LINES] = ("… %d more in :messages"):format(more)
    end
    return lines
end

---@param chunks table
---@param text string
---@param hl? string
local function add(chunks, text, hl)
    chunks[#chunks + 1] = { 0, text, hl and hl_ids[hl] or 0 }
end

---@param chunks table
---@param filled integer
---@param filled_hl string
local function add_bar(chunks, filled, filled_hl)
    add(chunks, ("▰"):rep(filled), filled_hl)
    add(chunks, ("▱"):rep(BAR_WIDTH - filled), "ProgressBarTodo")
end

---@param chunks table
---@param tick integer
local function add_moving_bar(chunks, tick)
    local span = BAR_WIDTH - BAR_BLOCK
    local step = tick % (2 * span)
    local offset = step <= span and step or 2 * span - step
    add(chunks, ("▱"):rep(offset), "ProgressBarTodo")
    add(chunks, ("▰"):rep(BAR_BLOCK), "ProgressBarDone")
    add(chunks, ("▱"):rep(span - offset), "ProgressBarTodo")
end

--- Build the ui2 content of a row. Only the frame and the msg_show hook call this.
---
---   ⠹ lua_ls       ▰▰▰▱▱▱▱▱  42%
---     Indexing 12/40
---@param task progress.Task
---@return table
local function render(task)
    local tick = math.floor(uv.hrtime() / (FRAME_MS * 1e6))
    local failed = task.status == "failed" or task.status == "cancel"
    local chunks = {}

    if task.status == "success" then
        add(chunks, " ✓ ", "ProgressOk")
    elseif failed then
        add(chunks, " ✗ ", "ProgressFail")
    else
        add(chunks, " " .. SPINNER[tick % #SPINNER + 1] .. " ", "ProgressSpinner")
    end

    if not task.title_cell then
        task.title_cell = fit(task.title, TITLE_WIDTH)
        local suffix = task.suffix or ""
        task.text_cell = fit(task.text, TEXT_WIDTH - api.nvim_strwidth(suffix)) .. suffix
    end
    add(chunks, task.title_cell .. " ", "ProgressTitle")

    if task.status == "running" and not task.percent then
        add_moving_bar(chunks, tick)
    else
        local filled = math.floor((task.percent or 0) / 100 * BAR_WIDTH + 0.5)
        add_bar(
            chunks,
            filled,
            task.status == "success" and "ProgressOk" or failed and "ProgressFail" or "ProgressBarDone"
        )
    end

    add(chunks, task.percent and (" %3d%% "):format(task.percent) or "      ", "ProgressPercent")
    add(chunks, "\n" .. INDENT .. task.text_cell .. " ")

    if task.detail then
        add(chunks, "\n" .. INDENT .. table.concat(wrap_detail(task.detail), "\n" .. INDENT), "ProgressFail")
    end

    return chunks
end

-- ui2 routes messages to the dialog while a prompt is active and to the pager
-- below an expanded cmdline, so a running row would add a line on each frame.
local function blocked()
    return hooked and (ui.cmd.prompt or ui.cmd.expand > 0)
end

--- Make a visible row expire after `delay_ms`. ui2 has only the global
--- 'messagesopt' timeout, so this restarts its timer with a new delay. The timer
--- callback of ui2 removes the row and resizes or hides the window.
---@param id string|integer
---@param delay_ms integer
local function expire_row_in(id, delay_ms)
    local entry = messages.msg.ids[id]
    local timer = entry and entry.timer
    if not timer or timer:is_closing() then
        return
    end
    timer:set_repeat(delay_ms)
    timer:again()
    timer:set_repeat(0)
end

---@param task progress.Task
local function retime(task)
    local elapsed_ms = (uv.hrtime() - task.finished) / 1e6
    expire_row_in(task.id, math.max(1, math.floor(task.lifetime_ms - elapsed_ms)))
end

---@param task progress.Task
---@param history boolean
local function echo(task, history)
    local chunks = { { task.text .. (task.suffix or "") } }
    if task.detail then
        chunks[2] = { "\n" .. task.detail }
    end
    api.nvim_echo(chunks, history, {
        id = task.id,
        kind = "progress",
        source = task.source,
        title = task.title,
        status = task.status,
        percent = task.percent,
    })
end

--- Emit a final status with no row, so that the terminal progress bar and
--- vim.ui.progress_status() do not keep a task that the store removed.
---@param task progress.Task
---@param history boolean
local function echo_silently(task, history)
    silent_id = task.id
    echo(task, history)
    silent_id = nil
end

local function install_hooks()
    -- ui2 only stops the replaced timer. A stopped timer is never closed or
    -- collected, so each update of a visible row would leak one uv handle.
    local start_timer = messages.msg.start_timer
    messages.msg.start_timer = function(self, buf, id)
        local entry = self.ids[id]
        local timer = entry and entry.timer
        if timer then
            if not timer:is_closing() then
                timer:close()
            end
            entry.timer = nil
        end
        return start_timer(self, buf, id)
    end

    local msg_show = messages.msg_show
    messages.msg_show = function(kind, content, replace_last, history, append, id, trigger)
        if kind ~= "progress" then
            return msg_show(kind, content, replace_last, history, append, id, trigger)
        end

        if id == silent_id then
            return
        end

        local task = tasks[id]
        -- Core still got the update, so the Progress event and the history stay correct.
        if task and task.hidden then
            return
        end

        if blocked() then
            -- The frame draws the current state when the prompt closes.
            if task then
                task.dirty = true
            end
            return
        end

        if task then
            content = render(task)
        end
        msg_show(kind, content, replace_last, history, append, id, trigger)
        if task and task.finished then
            retime(task)
        end
    end
end

---@param task progress.Task
---@param now integer
local function expire(task, now)
    if task.finished then
        if now - task.finished >= task.lifetime_ms * 1e6 then
            tasks[task.id] = nil
            if task.dirty and task.owned then
                echo_silently(task, task.status ~= "success")
            end
        end
    elseif task.alive and not task.alive() then
        if task.on_stale then
            task.on_stale()
        end
        M.finish(task.id, "failed", { text = "stopped", lifetime_ms = SUCCESS_MS })
    elseif task.idle_timeout_ms and now - task.updated >= task.idle_timeout_ms * 1e6 then
        if task.on_stale then
            task.on_stale()
        end
        M.drop(task.id)
    end
end

local function frame()
    local now = uv.hrtime()
    for _, task in pairs(tasks) do
        expire(task, now)
    end

    if blocked() then
        return
    end

    local drew = false
    local function draw(id)
        if not drew then
            ui.check_targets()
            drew = true
        end
        -- A direct call skips nvim_echo, so a frame fires no Progress autocmd
        -- and writes no terminal progress sequence.
        messages.msg_show("progress", {}, false, false, false, id, "")
    end

    for id, task in pairs(tasks) do
        if task.dirty then
            task.dirty = false
            if task.owned then
                echo(task, task.status == "failed" or task.status == "cancel")
            elseif hooked then
                draw(id)
            end
        elseif hooked and not task.finished and not task.hidden then
            draw(id)
        end
    end

    if drew then
        -- Without this flush the msg window does not update in cmdline mode.
        ui.redrawing = true
        api.nvim__redraw({ win = ui.wins.msg, flush = true })
        ui.redrawing = false
    end
end

local function run_loop()
    while next(tasks) ~= nil do
        frame()
        vim.async.sleep(FRAME_MS)
    end
    loop = nil
end

local function wake()
    if loop or wake_pending then
        return
    end
    wake_pending = true
    -- Start outside the caller: 'Progress' handlers must not edit buffers during
    -- a file read, and a loop started inside an async task would become its child.
    vim.schedule(function()
        wake_pending = false
        if loop or next(tasks) == nil then
            return
        end
        local task = vim.async.run(run_loop):raise_on_error()
        loop = task
        -- A frame error ends the task without reaching the end of run_loop.
        task:on_complete(function()
            if loop == task then
                loop = nil
            end
        end)
    end)
end

--- Create or update a running row. This only updates the store, so a burst of
--- reports costs at most one nvim_echo per row per frame.
---@param id string|integer
---@param fields progress.ReportFields
function M.report(id, fields)
    if not enabled then
        return
    end

    local now = uv.hrtime()
    local task = tasks[id]
    if not task or task.finished then
        task = new_task(id, true, now)
    end

    task.source = fields.source
    task.title = fields.title
    task.text = fields.text
    task.suffix = fields.suffix
    task.percent = clamp_percent(fields.percent)
    task.status = "running"
    task.updated = now
    task.idle_timeout_ms = fields.idle_timeout_ms
    task.alive = fields.alive
    task.on_stale = fields.on_stale
    task.title_cell, task.text_cell = nil, nil
    task.dirty = true
    wake()
end

--- Set the final state of a row. The row stays visible for its lifetime.
---@param id string|integer
---@param status "success"|"failed"|"cancel"
---@param fields? progress.FinishFields
function M.finish(id, status, fields)
    if not enabled then
        return
    end

    fields = fields or {}
    local now = uv.hrtime()
    local task = tasks[id] or new_task(id, true, now)

    task.source = fields.source or task.source
    task.title = fields.title or task.title
    task.text = fields.text or task.text
    task.suffix = format_elapsed(now - task.started)
    task.percent = status == "success" and 100 or clamp_percent(fields.percent) or task.percent
    task.status = status
    task.updated = now
    task.finished = now
    task.detail = fields.detail
    -- The row is the only place that shows the error, so a failure must be seen.
    if status ~= "success" then
        task.hidden = nil
    end
    task.lifetime_ms = fields.lifetime_ms or (status == "success" and SUCCESS_MS or FAILURE_MS)
    task.alive, task.on_stale = nil, nil
    task.title_cell, task.text_cell = nil, nil
    task.dirty = true
    wake()
end

--- Remove a row without a final row on screen. A visible row expires by its timer.
---@param id string|integer
function M.drop(id)
    local task = tasks[id]
    if not task then
        return
    end

    tasks[id] = nil
    if task.owned then
        task.status = "failed"
        echo_silently(task, false)
    end
end

--- Remove the visible rows and leave other messages in the msg window. A running
--- task stays hidden until it ends, and its next run shows again.
function M.hide()
    if not hooked then
        return
    end

    for id, task in pairs(tasks) do
        if task.finished and not task.dirty then
            tasks[id] = nil
        else
            task.hidden = true
        end
        expire_row_in(id, 1)
    end
end

---@param ev table
local function on_foreign_progress(ev)
    local data = ev.data
    -- `:messages` fires Progress for history entries, with no status.
    if not data or not data.status or not data.id then
        return
    end
    if type(data.source) == "string" and data.source:sub(1, 9) == "progress." then
        return
    end

    local now = uv.hrtime()
    local task = tasks[data.id]
    if not task or task.finished then
        task = new_task(data.id, false, now)
    end

    local source = data.source or ""
    task.source = source
    task.title = (data.title and data.title ~= "") and data.title or source
    task.text = table.concat(data.text or {}, "")
    task.percent = clamp_percent(data.percent)
    task.status = data.status
    task.updated = now
    task.title_cell, task.text_cell = nil, nil

    if data.status == "running" then
        task.idle_timeout_ms = source == "nvim" and CORE_IDLE_MS or FOREIGN_IDLE_MS
    else
        task.finished = now
        task.suffix = format_elapsed(now - task.started)
        task.percent = data.status == "success" and 100 or task.percent
        task.lifetime_ms = data.status == "success" and SUCCESS_MS or FAILURE_MS
        if data.status ~= "success" then
            task.hidden = nil
        end
    end

    wake()
end

--- Safe to call more than once. Rows fall back to the core format when the
--- private ui2 functions are missing.
function M.setup()
    if initialized then
        return
    end
    initialized = true

    if #api.nvim_list_uis() == 0 then
        return
    end

    ui = require("vim._core.ui2")
    messages = ui.msg
    if not messages then
        return
    end
    enabled = true

    local group = api.nvim_create_augroup("ProgressMessages", { clear = true })

    set_highlights()
    api.nvim_create_autocmd("ColorScheme", { group = group, callback = set_highlights })

    hooked = type(messages.msg_show) == "function"
        and type(messages.msg) == "table"
        and type(messages.msg.ids) == "table"
        and type(messages.msg.start_timer) == "function"
        and type(ui.cmd) == "table"
        and type(ui.check_targets) == "function"

    if hooked then
        install_hooks()
        api.nvim_create_autocmd("Progress", { group = group, callback = on_foreign_progress })
    end

    require("progress.lsp").setup()
    require("progress.conform").setup()
end

return M

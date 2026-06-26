vim.o.cmdheight = 0

local ui2 = require("vim._core.ui2")

ui2.enable({
    enable = true,
    msg = {
        targets = "msg",
        cmd = {
            height = 0.5,
        },
        dialog = {
            height = 0.5,
        },
        msg = { height = 0.3, timeout = 4000 },
        pager = { height = 0.8 },
    },
})

local messages = require("vim._core.ui2.messages")

if not messages.notify_msg_show_override then
    messages.notify_msg_show_override = messages.msg_show

    local notify_kinds = {
        echo = true,
        echoerr = true,
        echomsg = true,
        emsg = true,
        lua_error = true,
        lua_print = true,
        quickfix = true,
        rpc_error = true,
        shell_ret = true,
        undo = true,
        wmsg = true,
    }

    local error_kinds = {
        echoerr = true,
        emsg = true,
        lua_error = true,
        rpc_error = true,
    }

    messages.msg_show = function(kind, content, replace_last, history, append, id, trigger)
        if notify_kinds[kind] then
            local text = table.concat(
                vim.tbl_map(function(chunk)
                    return chunk[2]
                end, content),
                ""
            )

            if text ~= "" then
                vim.notify(text, error_kinds[kind] and vim.log.levels.ERROR or vim.log.levels.INFO, {
                    id = id ~= 0 and ("ui2:" .. tostring(id)) or nil,
                    replace = replace_last and id ~= 0 and ("ui2:" .. tostring(id)) or nil,
                    title = kind == "lua_print" and "Lua" or "Message",
                })
            end

            return
        end

        return messages.notify_msg_show_override(kind, content, replace_last, history, append, id, trigger)
    end
end

local M = {}

local function matches_process(command, process_names)
	local executable = command:match("^%s*(%S+)")
	local executable_name = executable and executable:match("([^/]+)$")
	if not executable_name then
		return false
	end

	for _, process_name in ipairs(process_names) do
		local wrapped_pattern = "^%." .. vim.pesc(process_name) .. "%-wrap"
		if executable_name == process_name or executable_name:match(wrapped_pattern) then
			return true
		end
	end

	return false
end

local function parse_process_tree(output)
	local processes = {}
	local children = {}

	for line in output:gmatch("[^\n]+") do
		local pid, parent_pid, command = line:match("^%s*(%d+)%s+(%d+)%s+(.+)$")
		pid = tonumber(pid)
		parent_pid = tonumber(parent_pid)

		if pid and parent_pid and command then
			processes[pid] = command
			children[parent_pid] = children[parent_pid] or {}
			table.insert(children[parent_pid], pid)
		end
	end

	return processes, children
end

local function process_tree_matches(pid, process_names, processes, children, visited)
	if visited[pid] then
		return false
	end
	visited[pid] = true

	if processes[pid] and matches_process(processes[pid], process_names) then
		return true
	end

	for _, child_pid in ipairs(children[pid] or {}) do
		if process_tree_matches(child_pid, process_names, processes, children, visited) then
			return true
		end
	end

	return false
end

function M.find_pane(process_names, list_flag)
	if type(process_names) == "string" then
		process_names = { process_names }
	end

	local list_command = { "tmux", "list-panes" }
	if list_flag and list_flag ~= "" then
		table.insert(list_command, list_flag)
	end
	vim.list_extend(list_command, { "-F", "#{pane_id} #{pane_pid}" })

	local panes = vim.system(list_command, { text = true }):wait()
	if panes.code ~= 0 then
		return nil, "No tmux session"
	end

	local process_list = vim.system({ "ps", "-e", "-o", "pid=,ppid=,command=" }, { text = true }):wait()
	if process_list.code ~= 0 then
		return nil, "Failed to inspect tmux pane processes"
	end

	local processes, children = parse_process_tree(process_list.stdout or "")
	for line in (panes.stdout or ""):gmatch("[^\n]+") do
		local pane_id, pane_pid = line:match("^(%S+)%s+(%d+)$")
		pane_pid = tonumber(pane_pid)

		if pane_id and pane_pid and process_tree_matches(pane_pid, process_names, processes, children, {}) then
			return pane_id
		end
	end

	return nil
end

return M

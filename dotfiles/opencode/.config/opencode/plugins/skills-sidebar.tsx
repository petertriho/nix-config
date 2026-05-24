/** @jsxImportSource @opentui/solid */
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui";
import { For, Show, createMemo, createSignal } from "solid-js";

const id = "skills-sidebar";
const SIDEBAR_ORDER = 160;

function isLoadedSkillPart(part: unknown): part is {
  type: "tool";
  tool: "skill";
  state: { status: "completed"; input: { name: string } };
} {
  if (!part || typeof part !== "object") return false;

  const toolPart = part as {
    type?: unknown;
    tool?: unknown;
    state?: { status?: unknown; input?: { name?: unknown } };
  };

  return (
    toolPart.type === "tool" &&
    toolPart.tool === "skill" &&
    toolPart.state?.status === "completed" &&
    typeof toolPart.state.input?.name === "string" &&
    toolPart.state.input.name.trim().length > 0
  );
}

function loadedSkillNames(api: TuiPluginApi, sessionID: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const message of api.state.session.messages(sessionID)) {
    for (const part of api.state.part(message.id)) {
      if (!isLoadedSkillPart(part)) continue;

      const name = part.state.input.name.trim();
      if (seen.has(name)) continue;

      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

function SkillsSidebarContent(props: {
  api: TuiPluginApi;
  sessionID: string;
}) {
  const [open, setOpen] = createSignal(true);
  const theme = () => props.api.theme.current;
  const names = createMemo(() => loadedSkillNames(props.api, props.sessionID));

  return (
    <Show when={names().length > 0}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => names().length > 2 && setOpen((value) => !value)}>
          <Show when={names().length > 2}>
            <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
          </Show>
          <text fg={theme().text}>
            <b>Skills</b>
          </text>
        </box>
        <Show when={names().length <= 2 || open()}>
          <For each={names()}>
            {(name) => (
              <text fg={theme().textMuted} wrapMode="none">
                {name}
              </text>
            )}
          </For>
        </Show>
      </box>
    </Show>
  );
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx, props: { session_id: string }) {
        return <SkillsSidebarContent api={api} sessionID={props.session_id} />;
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
};

export default plugin;

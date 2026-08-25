import { Extension, ReactRenderer } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import { SlashMenu, type SlashMenuHandle, type SlashMenuProps } from "../components/SlashMenu";
import { slashItems, type SlashItem } from "../lib/slash-items";

/**
 * SlashCommand — gõ `/` để chèn một pill vào giữa câu.
 *
 * ┌── AI LÀM GÌ Ở ĐÂY ───────────────────────────────────────────────────────┐
 * │ `@tiptap/suggestion` lo phần KHÓ và vô hình: nhận ra người dùng vừa gõ    │
 * │ `/`, theo dõi chữ gõ tiếp sau nó, biết lúc nào thoát (dấu cách, Escape,   │
 * │ con trỏ đi chỗ khác), và neo hộp menu theo caret kể cả khi trang cuộn.    │
 * │ Ở v3 nó còn tự mount + tự định vị bằng floating-ui qua `props.mount` —    │
 * │ trước đây chỗ này là một đống code tippy.js viết tay.                     │
 * │ Phần của ta chỉ còn ba việc: liệt kê mục, vẽ menu, chèn node.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mọi mục đều chèn node INLINE (pill), nên `insertContent` là đủ — không còn ca
 * chèn node khối như bản trước, và cũng không còn cái bẫy đi kèm nó (node khối
 * chèn giữa một paragraph bị ProseMirror bỏ đi trong im lặng).
 */
export const SlashCommand = Extension.create({
  name: "promptLabSlash",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        /* `allowSpaces: false` — thực đơn đóng ngay khi gõ dấu cách. Cho phép
           dấu cách thì một câu bình thường có chứa "/" (đường dẫn, phân số) sẽ
           kéo menu lên và ở lì đó. */
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }) => slashItems(query),

        command: ({ editor, range, props }) => {
          /* `deleteRange(range)` xoá cả ký tự `/` lẫn chữ đã gõ để lọc — nếu
             không, chèn xong pill vẫn còn "/chat" nằm chỏng chơ trước nó. */
          editor.chain().focus().deleteRange(range).insertContent(props.content()).run();
        },

        render: () => {
          let component: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer<SlashMenuHandle, SlashMenuProps>(SlashMenu, {
                editor: props.editor,
                props: { items: props.items, command: (item: SlashItem) => props.command(item) },
              });
              /* `props.mount` gắn element vào `document.body` và tự neo theo
                 caret; nó trả về hàm gỡ, phải gọi ở `onExit` nếu không menu sẽ
                 nằm lại trên trang sau khi editor đã quên nó. */
              unmount = props.mount(component.element);
            },

            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: (item: SlashItem) => props.command(item) });
            },

            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                /* Trả `true` = "tôi đã xử lý" ⇒ Escape không rơi xuống editor.
                   Bản thân plugin sẽ đóng menu khi thấy phím này. */
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },

            onExit: () => {
              unmount?.();
              unmount = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});

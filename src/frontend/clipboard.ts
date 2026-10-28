/**
 * Puts text on the clipboard, and says whether it got there.
 *
 * The Clipboard API is refused in some browsers even on localhost: an
 * embedded browser can deny the write permission, and a page opened by a
 * LAN address has no `navigator.clipboard` at all. A refusal is not left
 * silent: the text goes through a selected textarea and `copy` instead,
 * which those browsers still allow during a click.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused: fall through to the textarea.
    }
  }
  return copyThroughTextarea(text);
}

function copyThroughTextarea(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  // Inside an open dialog, so its focus trap doesn't take focus back from
  // the textarea before the copy.
  const host =
    document.activeElement?.closest("[role='dialog']") ?? document.body;
  host.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

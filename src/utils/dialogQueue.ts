/**
 * dialogQueue.ts
 * The questions and notices of `Alert.alert` in a web browser, waiting for their turn on screen. React Native Web leaves
 * Alert.alert empty, so without this a failed sign-in or a "Delete chat?" question would simply never show. The web root layout
 * (app/_layout.web.tsx) points Alert.alert here, and components/parchment/DialogHost.tsx draws what is waiting, one dialog at a
 * time. A phone keeps its own native alert.
 * No React, no native code, so plain Node can test it (tests/unit/dialogQueue.test.ts).
 */

export interface DialogButton {
  text?: string;
  /** 'cancel' is the way out and 'destructive' is drawn as a warning; anything else is an ordinary choice. */
  style?: string;
  onPress?: (...args: any[]) => unknown;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  /** Never empty: a notice gets one OK button. */
  buttons: DialogButton[];
}

let nextId = 1;
let waiting: DialogRequest[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** A notice that does nothing when answered: showing the same one twice would only stack two boxes saying the same thing. */
const isPlain = (dialog: DialogRequest) => dialog.buttons.every((button) => !button.onPress);

const sameWords = (a: DialogRequest, b: DialogRequest) =>
  a.title === b.title &&
  a.message === b.message &&
  a.buttons.length === b.buttons.length &&
  a.buttons.every((button, i) => button.text === b.buttons[i].text && button.style === b.buttons[i].style);

/** What `Alert.alert(title, message, buttons)` does in a browser: the dialog joins the queue, and shows when it is first. */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]): void {
  const request: DialogRequest = {
    id: nextId++,
    title,
    message: message || undefined,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  };
  if (isPlain(request) && waiting.some((other) => isPlain(other) && sameWords(other, request))) return;
  waiting = [...waiting, request];
  notify();
}

/** The dialog on screen, or null when nothing is waiting. The same object until something changes. */
export function currentDialog(): DialogRequest | null {
  return waiting[0] ?? null;
}

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A button was chosen: the dialog goes away first (the next one may appear), then the button's own action runs. */
export function answerDialog(id: number, button?: DialogButton): void {
  if (!waiting.some((dialog) => dialog.id === id)) return;
  waiting = waiting.filter((dialog) => dialog.id !== id);
  notify();
  button?.onPress?.();
}

/**
 * The button that leaving the dialog (Escape, a click outside it) stands for: "cancel" when there is one, the only button of a
 * plain notice, and nothing when the person has to choose (a question with no way out stays until it is answered).
 */
export function leaveButton(dialog: DialogRequest): DialogButton | null {
  return dialog.buttons.find((button) => button.style === 'cancel') ?? (dialog.buttons.length === 1 ? dialog.buttons[0] : null);
}

/** For tests: forget every dialog and listener. */
export function resetDialogs(): void {
  waiting = [];
  listeners.clear();
}

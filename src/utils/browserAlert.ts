/**
 * browserAlert.ts
 * What `Alert.alert` does in a web browser. React Native Web leaves it empty, so without this a failed sign-in or a
 * "Delete chat?" question would simply never show. A phone keeps its own native alert; app/_layout.tsx installs this only for the web.
 * No React, no native code, so plain Node can test it (tests/unit/browserAlert.test.ts).
 */

export interface AlertButtonLike {
  text?: string;
  style?: string;
  onPress?: (...args: any[]) => unknown;
}

export interface Asker {
  alert: (text: string) => void;
  confirm: (text: string) => boolean;
}

/**
 * Zero or one button: a notice, then that button's action runs. Two or more: each choice that is not "cancel" is offered in turn
 * as an OK/Cancel question (with the button's name added when there is more than one), and the first OK runs its action;
 * if every one is declined, the "cancel" button's action runs.
 */
export function showBrowserAlert(ask: Asker, title: string, message?: string, buttons?: AlertButtonLike[]): void {
  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  if (list.length < 2) {
    ask.alert(text);
    list[0]?.onPress?.();
    return;
  }
  const cancel = list.find((b) => b.style === 'cancel');
  const choices = list.filter((b) => b !== cancel);
  for (const choice of choices) {
    const question = choices.length > 1 && choice.text ? `${text}\n\n${choice.text}?` : text;
    if (ask.confirm(question)) {
      choice.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

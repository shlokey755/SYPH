import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Asker, showBrowserAlert } from '../../src/utils/browserAlert.ts';

function asker(answers: boolean[] = []) {
  const shown: string[] = [];
  const asked: string[] = [];
  const ask: Asker = {
    alert: (t) => void shown.push(t),
    confirm: (t) => {
      asked.push(t);
      return answers.shift() ?? false;
    },
  };
  return { ask, shown, asked };
}

describe('showBrowserAlert', () => {
  it('shows a notice with the title and message, and runs the only button', () => {
    const { ask, shown } = asker();
    let ran = 0;
    showBrowserAlert(ask, 'Error', 'Please try again.', [{ text: 'OK', onPress: () => void ran++ }]);
    assert.deepEqual(shown, ['Error\n\nPlease try again.']);
    assert.equal(ran, 1);
  });

  it('shows just the title when there is no message and no buttons', () => {
    const { ask, shown } = asker();
    showBrowserAlert(ask, 'Saved');
    assert.deepEqual(shown, ['Saved']);
  });

  it('runs the confirming button on OK and not the cancel one', () => {
    const { ask, asked } = asker([true]);
    const log: string[] = [];
    showBrowserAlert(ask, 'Delete chat', 'It comes back with a new message.', [
      { text: 'Cancel', style: 'cancel', onPress: () => void log.push('cancel') },
      { text: 'Delete', style: 'destructive', onPress: () => void log.push('delete') },
    ]);
    assert.deepEqual(log, ['delete']);
    assert.deepEqual(asked, ['Delete chat\n\nIt comes back with a new message.']);
  });

  it('runs the cancel button when the question is declined', () => {
    const { ask } = asker([false]);
    const log: string[] = [];
    showBrowserAlert(ask, 'Delete chat', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => void log.push('cancel') },
      { text: 'Delete', onPress: () => void log.push('delete') },
    ]);
    assert.deepEqual(log, ['cancel']);
  });

  it('offers several choices in turn, naming each, and runs the first accepted', () => {
    const { ask, asked } = asker([false, true]);
    const log: string[] = [];
    showBrowserAlert(ask, 'Delete message', undefined, [
      { text: 'Delete for me', onPress: () => void log.push('me') },
      { text: 'Delete for everyone', onPress: () => void log.push('everyone') },
      { text: 'Cancel', style: 'cancel', onPress: () => void log.push('cancel') },
    ]);
    assert.deepEqual(asked, ['Delete message\n\nDelete for me?', 'Delete message\n\nDelete for everyone?']);
    assert.deepEqual(log, ['everyone']);
  });
});

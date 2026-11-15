import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { answerDialog, currentDialog, leaveButton, resetDialogs, showDialog, subscribeDialogs } from '../../src/utils/dialogQueue.ts';

beforeEach(() => resetDialogs());

describe('dialogQueue', () => {
  it('shows nothing until something is raised', () => {
    assert.equal(currentDialog(), null);
  });

  it('gives a notice without buttons one OK button, and keeps the words', () => {
    showDialog('Saved', 'Your profile was saved.');
    const dialog = currentDialog();
    assert.equal(dialog?.title, 'Saved');
    assert.equal(dialog?.message, 'Your profile was saved.');
    assert.deepEqual(dialog?.buttons, [{ text: 'OK' }]);
  });

  it('treats an empty message as no message', () => {
    showDialog('Saved', '');
    assert.equal(currentDialog()?.message, undefined);
  });

  it('returns the same object until something changes, which is what a store hook needs', () => {
    showDialog('One');
    assert.equal(currentDialog(), currentDialog());
  });

  it('shows dialogs one at a time, in the order they were raised', () => {
    showDialog('First');
    showDialog('Second');
    assert.equal(currentDialog()?.title, 'First');
    answerDialog(currentDialog()!.id);
    assert.equal(currentDialog()?.title, 'Second');
    answerDialog(currentDialog()!.id);
    assert.equal(currentDialog(), null);
  });

  it('removes the dialog before the chosen button runs, so the action may raise another one', () => {
    const seen: Array<string | undefined> = [];
    const button = {
      text: 'Delete',
      onPress: () => {
        seen.push(currentDialog()?.title);
        showDialog('Deleted');
      },
    };
    showDialog('Delete chat?', undefined, [{ text: 'Cancel', style: 'cancel' }, button]);
    answerDialog(currentDialog()!.id, button);
    assert.deepEqual(seen, [undefined]);
    assert.equal(currentDialog()?.title, 'Deleted');
  });

  it('runs only the button that was chosen', () => {
    const log: string[] = [];
    const cancel = { text: 'Cancel', style: 'cancel', onPress: () => void log.push('cancel') };
    const remove = { text: 'Delete', style: 'destructive', onPress: () => void log.push('delete') };
    showDialog('Delete?', undefined, [cancel, remove]);
    answerDialog(currentDialog()!.id, remove);
    assert.deepEqual(log, ['delete']);
  });

  it('ignores a second answer to the same dialog (a double click)', () => {
    let ran = 0;
    const button = { text: 'OK', onPress: () => void ran++ };
    showDialog('Hi', undefined, [button]);
    const { id } = currentDialog()!;
    answerDialog(id, button);
    answerDialog(id, button);
    assert.equal(ran, 1);
  });

  it('tells listeners when a dialog arrives and when it is answered, until they stop listening', () => {
    let calls = 0;
    const stop = subscribeDialogs(() => void calls++);
    showDialog('One');
    answerDialog(currentDialog()!.id);
    assert.equal(calls, 2);
    stop();
    showDialog('Two');
    assert.equal(calls, 2);
  });

  it('shows the same plain notice only once while it is waiting', () => {
    showDialog('Offline', 'Check your connection.');
    showDialog('Offline', 'Check your connection.');
    answerDialog(currentDialog()!.id);
    assert.equal(currentDialog(), null);
  });

  it('keeps two identical dialogs whose buttons do something, because each action matters', () => {
    const onPress = () => {};
    showDialog('Delete?', undefined, [{ text: 'Delete', onPress }]);
    showDialog('Delete?', undefined, [{ text: 'Delete', onPress }]);
    answerDialog(currentDialog()!.id);
    assert.equal(currentDialog()?.title, 'Delete?');
  });
});

describe('leaveButton', () => {
  it('is the cancel button when there is one', () => {
    showDialog('Delete?', undefined, [{ text: 'Delete', style: 'destructive' }, { text: 'Cancel', style: 'cancel' }]);
    assert.equal(leaveButton(currentDialog()!)?.text, 'Cancel');
  });

  it('is the only button of a notice', () => {
    showDialog('Saved');
    assert.equal(leaveButton(currentDialog()!)?.text, 'OK');
  });

  it('is nothing when the person has to choose', () => {
    showDialog('Delete for whom?', undefined, [{ text: 'Delete for me' }, { text: 'Delete for everyone' }]);
    assert.equal(leaveButton(currentDialog()!), null);
  });
});

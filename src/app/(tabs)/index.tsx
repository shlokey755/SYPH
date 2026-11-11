/**
 * (tabs)/index.tsx - Chat tab
 * On a phone, and in a narrow browser window, the list of chats (components/chat/ChatListView.tsx). In a desktop browser window the
 * list is already beside the page (components/desktop/DesktopShell.tsx), so this shows an invitation to pick a chat.
 */
import { ChatListView } from '../../components/chat/ChatListView';
import { DesktopEmpty } from '../../components/desktop/DesktopShell';
import { useDesktopLayout } from '../../components/parchment';

export default function ChatTab() {
  const { desktop } = useDesktopLayout();
  return desktop ? <DesktopEmpty /> : <ChatListView />;
}

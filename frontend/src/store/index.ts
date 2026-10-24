// Zustand store for Arcanum TUI state management

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AgentState,
  Conversation,
  UIMessage,
  Provider,
  Plugin,
  EngineConfig,
  ThemeName,
} from '../types';
import { getTheme, Theme } from '../theme';

// Extended state with actions
interface ArcanumStore extends AgentState {
  // Theme
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;

  // Engine connection
  setEngineConnected: (connected: boolean) => void;
  setEngineStatus: (status: AgentState['engine_status']) => void;

  // Conversations
  addConversation: (conv: Conversation) => void;
  removeConversation: (id: string) => void;
  setCurrentConversation: (id: string | null) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  addMessage: (conversationId: string, message: UIMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<UIMessage>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  clearMessages: (conversationId: string) => void;

  // Providers
  setProviders: (providers: Provider[]) => void;
  addProvider: (provider: Provider) => void;
  updateProviderConfig: (name: string, config: Record<string, unknown>) => void;

  // Plugins
  setPlugins: (plugins: Plugin[]) => void;
  addPlugin: (plugin: Plugin) => void;
  removePlugin: (name: string) => void;

  // Config
  setConfig: (config: EngineConfig) => void;

  // Agent status
  setAgentStatus: (status: AgentState['status']) => void;

  // Reset
  reset: () => void;
}

const initialState: AgentState = {
  status: 'idle',
  current_conversation: null,
  conversations: [],
  providers: [],
  plugins: [],
  config: null,
  engine_connected: false,
  engine_status: 'stopped',
};

export const useStore = create<ArcanumStore>()(
  subscribeWithSelector((set, get) => {
    // Lazy initialize theme to avoid module evaluation order issues
    let initialTheme: Theme;
    try {
      initialTheme = getTheme('cyberpunk');
    } catch {
      // Fallback theme
      initialTheme = {
        name: 'Cyberpunk',
        colors: {
          primary: '#00ffff',
          secondary: '#ff00ff',
          accent: '#ffff00',
          background: '#0a0a12',
          surface: '#12121f',
          text: '#e0e0ff',
          text_muted: '#6a6a8a',
          border: '#00ffff44',
          success: '#00ff88',
          warning: '#ffaa00',
          error: '#ff3366',
          info: '#00ccff',
        },
        gradients: {
          primary: 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
          secondary: 'linear-gradient(135deg, #12121f 0%, #1a1a2e 100%)',
          accent: 'linear-gradient(90deg, #ff00ff 0%, #ffff00 100%)',
        },
      };
    }
    
    return {
      ...initialState,
      theme: initialTheme,
      themeName: 'cyberpunk',

      // Theme
      setTheme: (name: ThemeName) => set({ themeName: name, theme: getTheme(name) }),

      // Engine
      setEngineConnected: (connected: boolean) => set({ engine_connected: connected }),
      setEngineStatus: (status: AgentState['engine_status']) => set({ engine_status: status }),

      // Conversations
      addConversation: (conv: Conversation) =>
        set((state) => ({
          conversations: [conv, ...state.conversations],
          current_conversation: state.current_conversation || conv,
        })),

      removeConversation: (id: string) =>
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          current_conversation:
            state.current_conversation?.id === id ? null : state.current_conversation,
        })),

      setCurrentConversation: (id: string | null) =>
        set((state) => ({
          current_conversation: id
            ? state.conversations.find((c) => c.id === id) || null
            : null,
        })),

      updateConversation: (id: string, updates: Partial<Conversation>) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updated_at: Date.now() } : c
          ),
          current_conversation:
            state.current_conversation?.id === id
              ? { ...state.current_conversation, ...updates, updated_at: Date.now() }
              : state.current_conversation,
        })),

      addMessage: (conversationId: string, message: UIMessage) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, message], updated_at: Date.now() }
              : c
          ),
          current_conversation:
            state.current_conversation?.id === conversationId
              ? {
                  ...state.current_conversation,
                  messages: [...state.current_conversation.messages, message],
                  updated_at: Date.now(),
                }
              : state.current_conversation,
        })),

      updateMessage: (conversationId: string, messageId: string, updates: Partial<UIMessage>) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m
                  ),
                }
              : c
          ),
          current_conversation:
            state.current_conversation?.id === conversationId
              ? {
                  ...state.current_conversation,
                  messages: state.current_conversation.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m
                  ),
                }
              : state.current_conversation,
        })),

      deleteMessage: (conversationId: string, messageId: string) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) }
              : c
          ),
          current_conversation:
            state.current_conversation?.id === conversationId
              ? {
                  ...state.current_conversation,
                  messages: state.current_conversation.messages.filter((m) => m.id !== messageId),
                }
              : state.current_conversation,
        })),

      clearMessages: (conversationId: string) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, messages: [], updated_at: Date.now() } : c
          ),
          current_conversation:
            state.current_conversation?.id === conversationId
              ? { ...state.current_conversation, messages: [], updated_at: Date.now() }
              : state.current_conversation,
        })),

      // Providers
      setProviders: (providers: Provider[]) => set({ providers }),
      addProvider: (provider: Provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),
      updateProviderConfig: (name: string, config: Record<string, unknown>) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.name === name ? { ...p, config: { ...p.config, ...config } } : p
          ),
        })),

      // Plugins
      setPlugins: (plugins: Plugin[]) => set({ plugins }),
      addPlugin: (plugin: Plugin) =>
        set((state) => ({ plugins: [...state.plugins, plugin] })),
      removePlugin: (name: string) =>
        set((state) => ({ plugins: state.plugins.filter((p) => p.name !== name) })),

      // Config
      setConfig: (config: EngineConfig) => set({ config }),

      // Agent status
      setAgentStatus: (status: AgentState['status']) => set({ status }),

      // Reset
      reset: () => set(initialState),
    };
  })
);

// Selectors for performance
export const selectTheme = (state: ArcanumStore) => state.theme;
export const selectThemeName = (state: ArcanumStore) => state.themeName;
export const selectCurrentConversation = (state: ArcanumStore) => state.current_conversation;
export const selectConversations = (state: ArcanumStore) => state.conversations;
export const selectProviders = (state: ArcanumStore) => state.providers;
export const selectPlugins = (state: ArcanumStore) => state.plugins;
export const selectAgentStatus = (state: ArcanumStore) => state.status;
export const selectEngineConnected = (state: ArcanumStore) => state.engine_connected;
export const selectEngineStatus = (state: ArcanumStore) => state.engine_status;
export const selectConfig = (state: ArcanumStore) => state.config;

// Hook for subscribing to specific slices
export function useTheme() {
  return useStore(selectTheme);
}

export function useThemeName() {
  return useStore(selectThemeName);
}

export function useCurrentConversation() {
  return useStore(selectCurrentConversation);
}

export function useConversations() {
  return useStore(selectConversations);
}

export function useProviders() {
  return useStore(selectProviders);
}

export function usePlugins() {
  return useStore(selectPlugins);
}

export function useAgentStatus() {
  return useStore(selectAgentStatus);
}

export function useEngineConnected() {
  return useStore(selectEngineConnected);
}

export function useEngineStatus() {
  return useStore(selectEngineStatus);
}

export function useConfig() {
  return useStore(selectConfig);
}
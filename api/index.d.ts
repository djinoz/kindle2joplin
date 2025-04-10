// Type definitions for Joplin Plugin API

import { SettingItemType, MenuItemLocation, ToolbarButtonLocation } from './types';

declare namespace JoplinPlugin {
  interface Plugin {
    register: (options: PluginOptions) => Promise<void>;
  }

  interface PluginOptions {
    onStart: () => Promise<void>;
  }

  interface JoplinSettings {
    registerSection: (name: string, options: any) => Promise<void>;
    registerSettings: (settings: any) => Promise<void>;
    registerSetting: (key: string, options: any) => Promise<void>;
    setValue: (key: string, value: any) => Promise<void>;
    value: (key: string) => Promise<any>;
  }

  interface JoplinCommands {
    register: (options: any) => Promise<void>;
  }

  interface JoplinViews {
    menuItems: {
      create: (id: string, commandName: string, location: MenuItemLocation) => Promise<void>;
    };
    toolbarButtons: {
      create: (id: string, commandName: string, label: string) => Promise<void>;
    };
    dialogs: {
      create: (id: string) => Promise<string>;
      addScript: (handle: string, path: string) => Promise<void>;
      setHtml: (handle: string, html: string) => Promise<void>;
      open: (handle: string | any) => Promise<any>;
      showMessageBox: (message: string) => Promise<void>;
      showForm: (options: any) => Promise<any>;
      close: (handle: string) => Promise<void>;
    };
    panels: {
      create: (id: string) => Promise<string>;
      setHtml: (handle: string, html: string) => Promise<void>;
    };
    MenuItemLocation: typeof MenuItemLocation;
  }

  interface JoplinWorkspace {
    selectedNote: () => Promise<any>;
  }

  interface JoplinData {
    get: (path: string[], query?: any) => Promise<any>;
    post: (path: string[], body?: any, query?: any) => Promise<any>;
    put: (path: string[], body?: any, query?: any) => Promise<any>;
  }

  interface Joplin {
    plugins: Plugin;
    settings: JoplinSettings;
    commands: JoplinCommands;
    views: JoplinViews;
    workspace: JoplinWorkspace;
    data: JoplinData;
  }
}

declare const joplin: JoplinPlugin.Joplin;
export default joplin;

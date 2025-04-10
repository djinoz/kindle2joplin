// Type definitions for Joplin Plugin API

export enum SettingItemType {
  String = 1,
  Int = 2,
  Bool = 3,
  Array = 4,
  Object = 5,
  Button = 6,
}

export enum MenuItemLocation {
  File = 1,
  Edit = 2,
  View = 3,
  Note = 4,
  Tools = 5,
  Help = 6,
}

export enum ToolbarButtonLocation {
  NoteToolbar = 1,
  EditorToolbar = 2,
}

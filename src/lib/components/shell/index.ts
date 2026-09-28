/*
 * The frame of the editor: the top bar with its menu, the tool rail, the status line, the drawer
 * of elements, and the sidebar with the tab that hides it. The components of this folder import
 * each other directly, others import from here.
 */
export { default as ElementsDrawer } from './ElementsDrawer.svelte';
export { default as MainMenu } from './MainMenu.svelte';
export { default as Sidebar } from './Sidebar.svelte';
export { default as SidebarToggle } from './SidebarToggle.svelte';
export { default as StatusBar } from './StatusBar.svelte';
export { default as ToolRail } from './ToolRail.svelte';
export { default as TopBar } from './TopBar.svelte';

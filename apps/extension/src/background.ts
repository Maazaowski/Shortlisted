// Service worker. Its only job is to open the side panel on toolbar click.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

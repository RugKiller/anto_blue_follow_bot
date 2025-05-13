// 监听插件安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Twitter Auto Browser 插件已安装');
  // 初始化默认设置
  chrome.storage.local.set({
    settings: {
      interval: 3,
      commentEnabled: false,
      commentTemplate: '求互关'
    }
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('后台脚本收到消息:', request);
  
  if (request.action === 'statusUpdate') {
    console.log('状态更新:', request.status);
    // 如果需要，可以在这里更新插件图标或徽章
  }

  // 新增：处理新开tab并关注用户
  if (request.action === 'openAndFollowUser') {
    const { profileUrl, username } = request;
    const sourceTabId = sender.tab && sender.tab.id; // 记录原tab
    console.log('[BG] 收到 openAndFollowUser:', profileUrl, username, 'from tab', sourceTabId);
    let tabId = null;
    let closed = false;
    function closeTabAndRespond(success, error, alreadyFollowed) {
      if (closed) return;
      closed = true;
      // 主动通知原tab
      if (sourceTabId) {
        chrome.tabs.sendMessage(sourceTabId, {
          action: 'followResult',
          username,
          success,
          error,
          alreadyFollowed
        });
      }
      sendResponse({ success, error }); // 兼容老逻辑
    }
    chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('[BG] tabs.create失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      console.log('[BG] 新tab已创建:', tab);
      tabId = tab.id;
      // 注入auto_follow.js
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['auto_follow.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[BG] 注入auto_follow.js失败:', chrome.runtime.lastError);
          closeTabAndRespond(false, chrome.runtime.lastError.message, false);
        } else {
          console.log('[BG] 已注入auto_follow.js');
        }
      });
      // 监听auto_follow.js的关闭请求
      function onCloseMe(msg, sender) {
        if (msg.action === 'closeMe' && sender.tab && sender.tab.id === tabId) {
          console.log('[BG] 收到auto_follow.js关闭请求:', msg);
          chrome.runtime.onMessage.removeListener(onCloseMe);
          closeTabAndRespond(!msg.error, msg.error, msg.alreadyFollowed);
        }
      }
      chrome.runtime.onMessage.addListener(onCloseMe);
    });
    return true; // 异步响应
  }
  
  // 确保消息得到响应
  sendResponse({received: true});
  return true;  // 保持消息通道开放
});

// 创建一个标签页ID集合，记录已经注入脚本的标签页
const injectedTabs = new Set();

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 当页面完全加载完成时
  if (changeInfo.status === 'complete' && tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
    console.log('检测到Twitter页面加载完成，准备注入脚本');
    
    // 检查是否已经注入过
    if (injectedTabs.has(tabId)) {
      console.log('该标签页已经注入过脚本，跳过注入');
      return;
    }
    
    // 注入auto_view.js
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['auto_view.js']
      }).then(() => {
        console.log('auto_view.js 注入成功');
        injectedTabs.add(tabId);
      }).catch(err => {
        console.error('auto_view.js 注入失败:', err);
      });
    } catch (error) {
      console.error('执行脚本时出错:', error);
    }
  }
});

// 监听标签页关闭事件，清理记录
chrome.tabs.onRemoved.addListener((tabId) => {
  if (injectedTabs.has(tabId)) {
    injectedTabs.delete(tabId);
    console.log(`标签页 ${tabId} 已关闭，从注入记录中移除`);
  }
}); 
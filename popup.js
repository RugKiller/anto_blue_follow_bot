let isTaskRunning = false;

// API配置
const API_CONFIG = {
  PUMP_TOOLS: {
    BASE_URL: 'https://pumptools.me/api/extension',
    ENDPOINTS: {
      XRISK_ADS: '/get_xrisk_ads'
    }
  }
};

// API请求函数
async function makeRequest(endpoint, payload, description) {
  try {
    const url = `${API_CONFIG.PUMP_TOOLS.BASE_URL}${endpoint}`;
    console.log(`准备发送${description}请求:`, url, payload);

    console.log('开始fetch请求...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('fetch请求完成，状态:', response.status);

    if (!response.ok) {
      console.log('请求失败，状态码:', response.status);
      return { ads: null };
    }

    console.log('开始解析响应数据...');
    const result = await response.json();
    console.log(`${description}响应数据:`, result);
    return result;
  } catch (error) {
    console.error(`${description}请求出错:`, error);
    return { ads: null };
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const browseInterval = document.getElementById('browseInterval');
  const maxCount = document.getElementById('maxCount');
  const browsedCount = document.getElementById('browsedCount');
  const followedCount = document.getElementById('followedCount');
  const followedUsers = document.getElementById('followedUsers');
  const notificationDiv = document.querySelector('.notification p');

  console.log('弹出窗口已加载');

  // 从存储中加载设置
  chrome.storage.local.get(['settings', 'stats'], function(result) {
    console.log('加载设置:', result);
    if (result.settings) {
      browseInterval.value = typeof result.settings.interval === 'number' ? result.settings.interval : 3;
      maxCount.value = typeof result.settings.maxCount === 'number' ? result.settings.maxCount : 50;
    } else {
      browseInterval.value = 3;
      maxCount.value = 50;
    }
    
    // 加载统计数据
    if (result.stats) {
      updateStats(result.stats);
    }
  });

  // 从存储中恢复任务状态
  chrome.storage.local.get(['isTaskRunning'], function(result) {
    isTaskRunning = result.isTaskRunning || false;
    updateButtonStates();
  });

  // 获取通知内容
  async function fetchNotification() {
    try {
      const payload = {
        "app_name": "blue_follow"
      };
      const result = await makeRequest(API_CONFIG.PUMP_TOOLS.ENDPOINTS.XRISK_ADS, payload, '获取广告内容');
      console.log('通知内容:', result);
      if (result.ads && result.ads.ads) {
        const notificationText = result.ads.ads;
        if (notificationDiv) {
          notificationDiv.innerHTML = notificationText;
          notificationDiv.parentElement.style.display = 'block';
        }
      } else {
        if (notificationDiv && notificationDiv.parentElement) {
          notificationDiv.parentElement.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('获取通知内容失败:', error);
      if (notificationDiv && notificationDiv.parentElement) {
        notificationDiv.parentElement.style.display = 'none';
      }
    }
  }

  // 页面加载时获取通知
  fetchNotification();

  // 保存设置
  function saveSettings() {
    const settings = {
      interval: parseInt(browseInterval.value),
      maxCount: parseInt(maxCount.value)
    };
    console.log('保存设置:', settings);
    chrome.storage.local.set({ settings: settings });
    return settings;
  }

  // 更新统计信息
  function updateStats(stats) {
    browsedCount.textContent = stats.browsedCount || 0;
    followedCount.textContent = stats.followedCount || 0;
    
    // 更新用户列表
    followedUsers.innerHTML = '';
    if (stats.followedUsers && stats.followedUsers.length > 0) {
      stats.followedUsers.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.innerHTML = `
          <a href="https://twitter.com/${user.username}" target="_blank">@${user.username}</a>
          <span class="timestamp">${new Date(user.timestamp).toLocaleString()}</span>
        `;
        followedUsers.appendChild(userElement);
      });
    } else {
      followedUsers.innerHTML = '<div class="no-users">暂无已关注用户</div>';
    }
  }

  // 检查当前标签页是否是Twitter
  function checkIfTwitterTab(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      const isTwitter = currentTab && (currentTab.url.includes('twitter.com') || currentTab.url.includes('x.com'));
      console.log('当前是否为Twitter页面:', isTwitter);
      
      if (!isTwitter) {
        alert('请在Twitter页面使用此插件');
        startBtn.disabled = true;
      }
      
      if (callback) callback(isTwitter, currentTab);
    });
  }

  // 确保content script已注入
  function ensureContentScriptInjected(tab, callback) {
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, function(response) {
      if (chrome.runtime.lastError) {
        console.log('Content script未检测到，尝试注入');
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['auto_view.js']
        }).then(() => {
          console.log('Content script注入成功');
          setTimeout(() => {
            if (callback) callback(true);
          }, 500);
        }).catch(err => {
          console.error('Content script注入失败:', err);
          alert('脚本注入失败，请刷新页面后重试');
          if (callback) callback(false);
        });
      } else {
        console.log('Content script已存在');
        if (callback) callback(true);
      }
    });
  }

  // 修改 updateButtonStates 函数
  function updateButtonStates() {
    if (isTaskRunning) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }

  // 开始浏览
  startBtn.addEventListener('click', function() {
    // 先清空 stats
    chrome.storage.local.set({ stats: { browsedCount: 0, followedCount: 0, followedUsers: [] } }, function() {
      updateStats({ browsedCount: 0, followedCount: 0, followedUsers: [] }); // 立即刷新首页
      // 再发起启动命令
      const settings = saveSettings();
      console.log('向content script发送开始命令');
      try {
        checkIfTwitterTab((isTwitter, tab) => {
          if (!isTwitter) return;
          
          ensureContentScriptInjected(tab, (injected) => {
            if (!injected) return;
            
            chrome.tabs.sendMessage(tab.id, {
              action: 'startBrowsing',
              settings: settings
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('发送消息时出错:', chrome.runtime.lastError);
                alert('启动失败，请刷新页面后重试');
                return;
              }
              
              console.log('收到content script响应:', response);
              isTaskRunning = true;
              chrome.storage.local.set({ isTaskRunning: true });
              updateButtonStates();
            });
          });
        });
      } catch (error) {
        console.error('发送消息时出错:', error);
        alert('启动失败，请刷新页面后重试');
      }
    });
  });

  // 停止浏览
  stopBtn.addEventListener('click', function() {
    console.log('向content script发送停止命令');
    try {
      checkIfTwitterTab((isTwitter, tab) => {
        if (!isTwitter) return;
        
        ensureContentScriptInjected(tab, (injected) => {
          if (!injected) return;
          
          chrome.tabs.sendMessage(tab.id, {action: 'stopBrowsing'}, (response) => {
            if (chrome.runtime.lastError) {
              console.error('发送消息时出错:', chrome.runtime.lastError);
              return;
            }
            
            console.log('收到content script响应:', response);
            isTaskRunning = false;
            chrome.storage.local.set({ isTaskRunning: false });
            updateButtonStates();
          });
        });
      });
    } catch (error) {
      console.error('发送消息时出错:', error);
    }
  });

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('弹出窗口收到消息:', request);
    
    if (request.action === 'statsUpdate') {
      updateStats(request.stats);
    } else if (request.action === 'ping') {
      sendResponse({ pong: true });
    }
    
    sendResponse({received: true});
    return true;  // 保持消息通道开放
  });
}); 
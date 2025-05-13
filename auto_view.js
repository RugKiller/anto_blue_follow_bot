// 初始化标志，表明content script已加载
console.log('Twitter Auto Browser content script 已加载');

let isRunning = false;
let browseInterval = null;
let settings = {};

// 记录已浏览的推文ID，避免重复浏览
let browsedTweetIds = new Set();
// 全局索引
let currentTweetIndex = 0;

// 记录已浏览和已关注的用户
let browsedUsers = new Set(); // 用户名集合
let followedUsers = new Set(); // 用户名集合
let followedUsersList = [];    // {username, timestamp}数组

function updateStatsStorage() {
  try {
    const stats = {
      browsedCount: browsedUsers.size,
      followedCount: followedUsers.size,
      followedUsers: followedUsersList.slice(-100)
    };
    chrome.storage.local.set({ stats });
    chrome.runtime.sendMessage({ action: 'statsUpdate', stats });
  } catch (e) {
    console.warn('updateStatsStorage 失败，可能是扩展上下文失效:', e);
  }
}

// 启动时从 storage 恢复历史数据
chrome.storage.local.get(['stats'], function(result) {
  if (result.stats) {
    if (Array.isArray(result.stats.followedUsers)) {
      followedUsersList = result.stats.followedUsers;
      followedUsers = new Set(result.stats.followedUsers.map(u => u.username));
    }
    if (typeof result.stats.browsedCount === 'number' && result.stats.browsedCount > 0) {
      // 没有用户名列表，只能等新数据
      // 可选：如有历史用户名列表可恢复 browsedUsers
    }
    console.log('[content script] 已恢复历史 stats:', result.stats);
  } else {
    console.log('[content script] 无历史 stats，初始化为空');
  }
});

let pendingProcessNext = null;

// 日志函数
function log(msg) {
  console.log(`[TwitterAutoBrowser] ${msg}`);
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Content script 收到消息:', request);
  
  try {
    if (request.action === 'startBrowsing') {
      settings = request.settings;
      log(`开始自动浏览，间隔: ${settings.interval}秒`);
      // 每次启动都重置所有统计数据
      browsedUsers.clear();
      followedUsers.clear();
      followedUsersList = [];
      browsedTweetIds.clear();
      updateStatsStorage();
      log('每次启动都重置所有统计数据');
      // 重置浏览状态
      browsedTweetIds.clear();
      currentTweetIndex = 0;
      startBrowsing(settings.interval, settings.maxCount);
      sendResponse({ success: true, message: '浏览已开始' });
    } else if (request.action === 'stopBrowsing') {
      log('收到停止浏览命令');
      stopBrowsing();
      sendResponse({ success: true, message: '浏览已停止' });
    } else if (request.action === 'ping') {
      console.log('收到ping请求，响应pong');
      sendResponse({ pong: true });
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // 保持消息通道开放
});

// 监听来自background的关注结果
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'followResult') {
    if (request.success) {
      log(`已关注并关闭@${request.username}主页`);
    } else {
      log(`关注@${request.username}失败：${request.error}`);
    }
    // 只有真正关注成功才计入已关注
    if (typeof pendingProcessNext === 'function') {
      const fn = pendingProcessNext;
      pendingProcessNext = null; // 先置空，防止多次调用
      setTimeout(() => {
        if (typeof fn === 'function') fn(request);
      }, settings.interval * 1000);
    } else if (typeof processNextTweet === 'function') {
      setTimeout(processNextTweet, settings.interval * 1000);
    }
  }
});

function getTweetUniqueId(tweetElement) {
  return tweetElement.getAttribute('data-tweet-id') ||
         tweetElement.getAttribute('data-testid-tweet-id') ||
         (
           (tweetElement.querySelector('[data-testid="User-Name"]')?.textContent || '') +
           '|' +
           (tweetElement.querySelector('[data-testid="tweetText"]')?.textContent || '')
         );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 开始浏览
function startBrowsing(interval = 3, maxCount = 30) {
  if (isRunning) return;
  isRunning = true;
  log(`开始自动浏览，间隔: ${interval}秒，最多${maxCount}个关注用户`);

  function processNextTweet() {
    if (!isRunning) return;
    // 以已关注用户数为终止条件
    if (followedUsers.size >= maxCount) {
      log(`已关注${maxCount}个用户，自动停止`);
      isRunning = false;
      // 更新本地存储中的任务状态
      chrome.storage.local.set({ isTaskRunning: false });
      return;
    }

    // 同时支持推文列表和用户列表
    const items = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"]');
    if (items.length === 0) {
      setTimeout(processNextTweet, 3000);
      return;
    }

    let found = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isUserList = item.getAttribute('data-testid') === 'UserCell';
      
      if (isUserList) {
        // 处理用户列表项
        const usernameElement = item.querySelector('a[href^="/"]');
        if (!usernameElement) continue;
        
        const username = usernameElement.getAttribute('href').replace('/', '');
        if (!username || browsedUsers.has(username)) continue;

        browsedUsers.add(username);
        updateStatsStorage();

        if (followedUsers.has(username)) {
          log(`用户@${username}已处理过，跳过`);
          setTimeout(processNextTweet, interval * 1000);
          found = true;
          break;
        }

        log(`处理用户列表项，准备关注@${username}`);
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        handleMutualFollow(item, function() {
          setTimeout(processNextTweet, interval * 1000);
        });
        found = true;
        break;
      } else {
        // 处理推文列表项
        const tweetId = getTweetUniqueId(item);
        if (!tweetId) continue;
        if (!browsedTweetIds.has(tweetId)) {
          browsedTweetIds.add(tweetId);
          const profileUrl = getUserProfileUrl(item);
          if (!profileUrl) {
            log('未能获取用户主页链接，跳过');
            setTimeout(processNextTweet, interval * 1000);
            found = true;
            break;
          }
          const username = profileUrl.split('/').pop();
          browsedUsers.add(username);
          updateStatsStorage();
          if (followedUsers.has(username)) {
            log(`用户@${username}已处理过，跳过`);
            setTimeout(processNextTweet, interval * 1000);
            found = true;
            break;
          }
          log(`处理推文，准备关注@${username}`);
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          handleMutualFollow(item, function() {
            setTimeout(processNextTweet, interval * 1000);
          });
          found = true;
          break;
        }
      }
    }

    if (!found) {
      log('本页已浏览完，加载更多...');
      items[items.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setTimeout(processNextTweet, 10000);
    }
  }

  processNextTweet();
}

// 只在推文卡片上查找关注按钮，不跳转页面
function followUser(tweetElement, callback) {
  try {
    log('尝试在推文卡片上寻找关注按钮...');
    // 多种可能的关注按钮选择器
    const followButtonSelectors = [
      '[data-testid="follow"]',
      '[data-testid="placementTracking"] div[role="button"]',
      'div[role="button"][data-testid*="follow"]',
      'div[role="button"][aria-label*="关注"]',
      'div[role="button"][aria-label*="Follow"]'
    ];
    let followButton = null;
    for (const selector of followButtonSelectors) {
      followButton = tweetElement.querySelector(selector);
      if (followButton) {
        log(`在推文卡片上使用选择器 "${selector}" 找到关注按钮`);
        break;
      }
    }
    if (!followButton) {
      // 兜底：查找包含"关注"文本的按钮
      const allButtons = tweetElement.querySelectorAll('div[role="button"]');
      for (const button of allButtons) {
        if ((button.textContent.includes('关注') || button.textContent.includes('Follow')) &&
            !button.textContent.includes('正在关注') &&
            !button.textContent.includes('Following')) {
          followButton = button;
          log('在推文卡片上通过文本内容找到关注按钮');
          break;
        }
      }
    }
    if (followButton) {
      log('在推文卡片上找到关注按钮，点击关注...');
      followButton.click();
      log('已点击关注按钮', 'success');
    } else {
      log('未在推文卡片上找到关注按钮，跳过', 'warning');
    }
    if (callback) callback();
  } catch (error) {
    log(`关注用户失败: ${error.message}`, 'error');
    if (callback) callback();
  }
}

// 停止浏览
function stopBrowsing() {
  if (!isRunning) {
    log('未在运行，忽略停止命令', 'warning');
    return;
  }
  isRunning = false;
  
  if (browseInterval) {
    clearInterval(browseInterval);
    browseInterval = null;
    log('自动浏览已停止', 'success');
  }
}

// 更新状态
function updateStatus(status) {
  try {
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: status
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('发送状态更新时出错:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error('发送状态更新时出错:', error);
  }
}

// 新增：处理互关时的关注流程
function handleMutualFollow(tweetElement, processNext) {
  const profileUrl = getUserProfileUrl(tweetElement);
  if (!profileUrl) {
    log('未能获取用户主页链接，跳过');
    processNext();
    return;
  }
  const username = profileUrl.split('/').pop();
  if (followedUsers.has(username)) {
    log(`用户@${username}已关注过，跳过`);
    processNext();
    return;
  }
  log(`准备在新tab关注用户@${username}，主页：${profileUrl}`);
  // 只发消息，不处理回调
  pendingProcessNext = function(followResult) {
    // 只有未关注过且本次真正点击了关注按钮才计入
    if (!followResult || !followResult.alreadyFollowed) {
      followedUsers.add(username);
      followedUsersList.push({ username, timestamp: Date.now() });
      updateStatsStorage();
    }
    if (typeof processNext === 'function') processNext();
  };
  chrome.runtime.sendMessage({
    action: 'openAndFollowUser',
    profileUrl,
    username
  });
  // 后续流程在 onMessage followResult 里处理
}

// 新增辅助函数：获取推文作者主页链接
function getUserProfileUrl(tweetElement) {
  // 1. 优先昵称区域
  const userNameA = tweetElement.querySelector('[data-testid="User-Name"] a[href^="/"]');
  if (userNameA) {
    const href = userNameA.getAttribute('href');
    if (href && /^\/[A-Za-z0-9_]+$/.test(href)) {
      const base = location.hostname.includes('x.com') ? 'https://x.com' : 'https://twitter.com';
      return `${base}${href}`;
    }
  }
  // 2. 头像区域
  const avatarA = tweetElement.querySelector('div[data-testid^="UserAvatar-Container-"] a[href^="/"]');
  if (avatarA) {
    const href = avatarA.getAttribute('href');
    if (href && /^\/[A-Za-z0-9_]+$/.test(href)) {
      const base = location.hostname.includes('x.com') ? 'https://x.com' : 'https://twitter.com';
      return `${base}${href}`;
    }
  }
  // 3. 兜底
  const allLinks = tweetElement.querySelectorAll('a[href^="/"]');
  for (const a of allLinks) {
    const href = a.getAttribute('href');
    if (/^\/[A-Za-z0-9_]+$/.test(href)) {
      const base = location.hostname.includes('x.com') ? 'https://x.com' : 'https://twitter.com';
      return `${base}${href}`;
    }
  }
  return null;
} 
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM已加载');
  
  // DOM元素
  const getCookiesBtn = document.getElementById('get-cookies');
  const toast = document.getElementById('toast');
  const replyStatus = document.getElementById('reply-status');
  const followStatus = document.getElementById('follow-status');
  
  // 输入元素
  const replyCount = document.getElementById('reply-count');
  const replyIntervalInput = document.getElementById('reply-interval');  // 改名
  const replyContent = document.getElementById('reply-content');
  const followCount = document.getElementById('follow-count');
  const followIntervalInput = document.getElementById('follow-interval');  // 改名
  
  // 按钮元素
  const startReplyBtn = document.getElementById('start-reply');
  const stopReplyBtn = document.getElementById('stop-reply');
  const startFollowBtn = document.getElementById('start-follow');
  const stopFollowBtn = document.getElementById('stop-follow');

  // 定时器变量
  let replyIntervalTimer = null;  // 改名
  let followIntervalTimer = null;  // 改名

  // 添加新的DOM元素引用
  const cookieDisplay = document.getElementById('cookie-display');
  const copyButton = document.getElementById('copy-cookies');

  if (!getCookiesBtn) {
    console.error('未找到获取Cookie按钮');
    return;
  }

  // 显示提示信息的函数
  function showToast(message) {
    console.log('显示提示：', message);
    if (!toast) {
      console.error('未找到toast元素');
      return;
    }
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  // 获取Cookie的函数（将原来的获取Cookie逻辑提取为独立函数）
  async function getCookies() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || !tabs[0]) {
          reject('无法获取当前标签页信息');
          return;
        }
        
        var url = tabs[0].url;
        chrome.cookies.getAll({url: url}, function(cookies) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError.message);
            return;
          }

          let cookiesText = '';
          for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i];
            cookiesText += cookie.name + '=' + cookie.value + (i < cookies.length - 1 ? '; ' : '');
          }
          resolve(cookiesText);
        });
      });
    });
  }

  // 自动回复功能
  startReplyBtn.addEventListener('click', async () => {
    const count = parseInt(replyCount.value);
    const interval = parseInt(replyIntervalInput.value) * 1000;
    const content = replyContent.value;
    
    // 更新状态
    replyStatus.classList.add('status-active');
    replyStatus.classList.remove('status-inactive');
    showToast('开始自动回复...');

    try {
      // 1. 跳转到 X.com
      const url = 'https://x.com';
      const tab = await chrome.tabs.create({ url });
      
      // 2. 等待页面加载完成（等待3秒）
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. 获取并显示Cookie
      try {
        // 激活新创建的标签页
        await chrome.tabs.update(tab.id, { active: true });
        const cookiesText = await getCookies();
        cookieDisplay.value = cookiesText;
        showToast('已获取X.com的Cookie！');
      } catch (error) {
        console.error('获取Cookie失败:', error);
        showToast('获取Cookie失败：' + error);
      }

    } catch (error) {
      console.error('执行过程出错:', error);
      showToast('执行失败：' + error);
      
      // 出错时重置状态
      replyStatus.classList.remove('status-active');
      replyStatus.classList.add('status-inactive');
    }
  });

  // 停止按钮功能
  stopReplyBtn.addEventListener('click', () => {
    if (replyIntervalTimer) {
      clearInterval(replyIntervalTimer);
      replyIntervalTimer = null;
    }
    replyStatus.classList.remove('status-active');
    replyStatus.classList.add('status-inactive');
    showToast('已停止自动回复');
  });

  // 自动关注功能
  startFollowBtn.addEventListener('click', () => {
    const count = parseInt(followCount.value);
    const interval = parseInt(followIntervalInput.value) * 1000;  // 使用改名后的变量
    
    followStatus.classList.add('status-active');
    followStatus.classList.remove('status-inactive');
    showToast('开始自动关注');
  });

  stopFollowBtn.addEventListener('click', () => {
    if (followIntervalTimer) {  // 使用改名后的变量
      clearInterval(followIntervalTimer);
      followIntervalTimer = null;
    }
    followStatus.classList.remove('status-active');
    followStatus.classList.add('status-inactive');
    showToast('已停止自动关注');
  });

  // 添加复制按钮功能
  copyButton.addEventListener('click', function() {
    if (cookieDisplay.value) {
      navigator.clipboard.writeText(cookieDisplay.value).then(function() {
        showToast('Cookie已复制到剪贴板！');
      }, function(err) {
        console.error('复制Cookie失败: ', err);
        showToast('复制Cookie失败');
      });
    } else {
      showToast('没有Cookie可复制');
    }
  });

  // 初始化状态指示器
  replyStatus.classList.add('status-inactive');
  followStatus.classList.add('status-inactive');
}); 
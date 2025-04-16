document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM已加载');
  
  // DOM元素
  const toast = document.getElementById('toast');
  const replyStatus = document.getElementById('reply-status');
  
  // 输入元素
  const replyCount = document.getElementById('reply-count');
  const searchKeyword = document.getElementById('search-keyword');
  const replyContent = document.getElementById('reply-content');
  
  // 按钮元素
  const startReplyBtn = document.getElementById('start-reply');
  const stopReplyBtn = document.getElementById('stop-reply');

  // 结果展示相关元素
  const replyResult = document.getElementById('reply-result');
  const replyLoading = document.getElementById('reply-loading');
  const replyResultContent = document.getElementById('reply-result-content');
  const followList = document.getElementById('follow-list');
  const replyList = document.getElementById('reply-list');

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

  // 获取Cookie的函数
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

  // 创建用户链接的函数
  function createUserLink(username) {
    const link = document.createElement('a');
    link.href = `https://x.com/${username}`;
    link.className = 'user-link';
    link.textContent = username;
    link.target = '_blank'; // 在新标签页中打开
    return link;
  }

  // 显示结果的函数
  function showResults(data) {
    // 隐藏加载提示
    replyLoading.style.display = 'none';
    
    // 清空之前的结果
    followList.innerHTML = '';
    replyList.innerHTML = '';
    
    // 显示关注列表
    if (data.follow_list && data.follow_list.length > 0) {
      data.follow_list.forEach(username => {
        followList.appendChild(createUserLink(username));
      });
    } else {
      followList.textContent = '暂无成功关注的用户';
    }
    
    // 显示回复列表
    if (data.reply_list && data.reply_list.length > 0) {
      data.reply_list.forEach(username => {
        replyList.appendChild(createUserLink(username));
      });
    } else {
      replyList.textContent = '暂无成功回复的用户';
    }
    
    // 显示结果区域
    replyResult.style.display = 'block';
    replyResultContent.style.display = 'block';
  }

  // 更新状态的函数
  function updateStatus(statusElement, isActive) {
    if (statusElement) {
      if (isActive) {
        statusElement.classList.add('status-active');
        statusElement.classList.remove('status-inactive');
      } else {
        statusElement.classList.remove('status-active');
        statusElement.classList.add('status-inactive');
      }
    }
  }

  // 自动回复功能
  startReplyBtn.addEventListener('click', async () => {
    let count = parseInt(replyCount.value);
    // 如果回复次数小于1，自动调整为1
    if (count < 1) {
      count = 1;
      replyCount.value = 1;
      showToast('回复次数已自动调整为1次');
    }
    // 如果回复次数大于10，自动调整为10
    if (count > 10) {
      count = 10;
      replyCount.value = 10;
      showToast('回复次数已自动调整为10次');
    }
    const keyword = searchKeyword.value.trim();
    const content = replyContent.value;
    
    // 更新状态
    updateStatus(replyStatus, true);
    showToast('开始自动回复...');

    // 显示加载提示
    if (replyResult) replyResult.style.display = 'block';
    if (replyLoading) replyLoading.style.display = 'block';
    if (replyResultContent) replyResultContent.style.display = 'none';

    try {
      // 1. 跳转到 X.com 搜索页面
      const encodedKeyword = encodeURIComponent(keyword);
      const url = `https://x.com/search?q=${encodedKeyword}&src=typed_query&f=live`;
      const tab = await chrome.tabs.create({ url });
      
      // 2. 等待页面加载完成（等待3秒）
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. 获取Cookie并发送请求
      try {
        // 激活新创建的标签页
        await chrome.tabs.update(tab.id, { active: true });
        const cookiesText = await getCookies();

        // 4. 发送POST请求
        console.log('准备发送POST请求...');
        const requestData = {
          cookie: cookiesText,
          query_word: keyword || '#蓝V互关',
          reply_content: content || '求关注',
          limit_cnt: count || 5
        };

        console.log('请求数据:', {
          ...requestData,
          cookie: '长度:' + requestData.cookie.length
        });

        const response = await fetch('https://pumptools.me/api/tools/auto_reply_and_follow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });

        console.log('收到响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('请求成功，响应数据:', result);
        
        if (result.status === 'success' && result.data) {
          showResults(result.data);
          showToast('自动回复完成！');
        } else {
          throw new Error('请求返回数据格式错误');
        }

      } catch (error) {
        console.error('获取Cookie或发送请求失败:', error);
        showToast('操作失败：' + error.message);
        // 隐藏加载提示
        if (replyLoading) replyLoading.style.display = 'none';
      }

    } catch (error) {
      console.error('执行过程出错:', error);
      showToast('执行失败：' + error.message);
      
      // 出错时重置状态
      updateStatus(replyStatus, false);
      // 隐藏加载提示
      if (replyLoading) replyLoading.style.display = 'none';
    }
  });

  // 停止按钮功能
  stopReplyBtn.addEventListener('click', () => {
    updateStatus(replyStatus, false);
    showToast('已停止自动回复');
  });

  // 初始化状态指示器
  updateStatus(replyStatus, false);
}); 